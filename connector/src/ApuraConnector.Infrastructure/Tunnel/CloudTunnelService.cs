using System.Collections.Concurrent;
using System.IO;
using System.Net.WebSockets;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using ApuraConnector.Core.Models;
using ApuraConnector.Core.Serialization;
using ApuraConnector.Infrastructure.Certificates;
using ApuraConnector.Infrastructure.Database;
using Serilog;

namespace ApuraConnector.Infrastructure.Tunnel;

public class CloudTunnelService
{
    private readonly ConnectorConfig _config;
    private readonly QueryExecutor _queryExecutor;
    private readonly SqlServerConnection _sqlConnection;
    private readonly ILogger _logger;
    private ClientWebSocket? _ws;
    private readonly DateTime _startTime = DateTime.UtcNow;
    private readonly SemaphoreSlim _sendLock = new(1, 1);
    private readonly SemaphoreSlim _messageHandlerLimit = new(10); // max 10 concurrent handlers
    private readonly ConcurrentDictionary<string, CancellationTokenSource> _queryTokens = new();
    private DateTime _lastHealthPong = DateTime.MinValue;
    private bool _isConnected;

    public bool IsConnected => _isConnected;

    public CloudTunnelService(
        ConnectorConfig config,
        QueryExecutor queryExecutor,
        SqlServerConnection sqlConnection,
        ILogger logger)
    {
        _config = config;
        _queryExecutor = queryExecutor;
        _sqlConnection = sqlConnection;
        _logger = logger;
    }

    public async Task RunAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await ConnectAndRunAsync(ct);
                // Server closed connection cleanly — still use backoff to avoid tight loop
                _isConnected = false;
                _logger.Information("Server closed connection, will reconnect with backoff");
                await ReconnectWithBackoffAsync(ct);
            }
            catch (Exception ex) when (!ct.IsCancellationRequested)
            {
                _isConnected = false;
                _logger.Warning(ex, "Tunnel disconnected, will reconnect");
                await ReconnectWithBackoffAsync(ct);
            }
        }
    }

    private async Task ConnectAndRunAsync(CancellationToken ct)
    {
        _ws = new ClientWebSocket();
        _ws.Options.SetRequestHeader("Authorization", $"Bearer {_config.ApiKey}");
        _ws.Options.SetRequestHeader("X-Connector-Version", "0.1.0");
        _ws.Options.KeepAliveInterval = TimeSpan.FromSeconds(_config.HeartbeatIntervalSeconds);

        // Add client certificate for mTLS (if configured)
        var clientCert = CertificateLoader.Load(_config);
        if (clientCert != null)
        {
            _ws.Options.ClientCertificates.Add(clientCert);
            _logger.Information("Client certificate loaded: {Thumbprint}", clientCert.Thumbprint);
        }

        var uri = new Uri(_config.TunnelEndpoint);
        _logger.Information("Connecting to {Endpoint}...", uri);

        // SEC-02: .NET validates server certificate by default via OS trust store.
        // DO NOT add ServerCertificateCustomValidationCallback -- it would bypass TLS validation.
        await _ws.ConnectAsync(uri, ct);
        _isConnected = true;
        _logger.Information("Connected to Apura cloud");

        // Run receive loop
        await ReceiveLoopAsync(ct);
    }

    private async Task ReceiveLoopAsync(CancellationToken ct)
    {
        var buffer = new byte[8 * 1024]; // 8KB buffer
        const int maxMessageSize = 256 * 1024; // 256KB max message

        while (_ws?.State == WebSocketState.Open && !ct.IsCancellationRequested)
        {
            using var ms = new MemoryStream();
            WebSocketReceiveResult result;

            do
            {
                result = await _ws.ReceiveAsync(new ArraySegment<byte>(buffer), ct);

                if (result.MessageType == WebSocketMessageType.Close)
                {
                    _isConnected = false;
                    _logger.Information("Server closed connection: {Status} {Description}",
                        result.CloseStatus, result.CloseStatusDescription);
                    return;
                }

                ms.Write(buffer, 0, result.Count);

                if (ms.Length > maxMessageSize)
                {
                    _logger.Warning("Message exceeds {MaxSize} bytes, discarding", maxMessageSize);
                    // Drain the rest of the message
                    while (!result.EndOfMessage)
                        result = await _ws.ReceiveAsync(new ArraySegment<byte>(buffer), ct);
                    ms.SetLength(0);
                    break;
                }
            } while (!result.EndOfMessage);

            if (ms.Length > 0 && result.MessageType == WebSocketMessageType.Text)
            {
                var json = Encoding.UTF8.GetString(ms.GetBuffer(), 0, (int)ms.Length);
                _ = Task.Run(async () => {
                    if (!await _messageHandlerLimit.WaitAsync(TimeSpan.FromSeconds(5), ct)) return;
                    try { await HandleMessageAsync(json, ct); }
                    finally { _messageHandlerLimit.Release(); }
                }, ct);
            }
        }
    }

    private async Task HandleMessageAsync(string json, CancellationToken ct)
    {
        try
        {
            var envelope = MessageSerializer.Deserialize(json);
            if (envelope == null) return;

            _logger.Debug("Received message: {Type} (id: {Id})", envelope.Type, envelope.Id);

            switch (envelope.Type)
            {
                case "query.execute":
                    await HandleQueryExecuteAsync(envelope, ct);
                    break;

                case "health.ping":
                    await HandleHealthPingAsync(envelope, ct);
                    break;

                case "query.cancel":
                    var cancelPayload = MessageSerializer.DeserializePayload<QueryCancelPayload>(envelope.Payload);
                    if (cancelPayload != null && _queryTokens.TryGetValue(cancelPayload.QueryId, out var cts))
                    {
                        cts.Cancel();
                        _logger.Information("Cancelled query {QueryId}", cancelPayload.QueryId);
                    }
                    break;

                default:
                    _logger.Warning("Unknown message type: {Type}", envelope.Type);
                    break;
            }
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Error handling message");
        }
    }

    private async Task HandleQueryExecuteAsync(MessageEnvelope envelope, CancellationToken ct)
    {
        var payload = MessageSerializer.DeserializePayload<QueryExecutePayload>(envelope.Payload);
        if (payload == null)
        {
            await SendMessageAsync(
                MessageSerializer.CreateErrorMessage(envelope.Id, "INVALID_PAYLOAD", "Missing query payload"),
                ct);
            return;
        }

        _logger.Information("Executing query (id: {Id})", envelope.Id);

        try
        {
            // SECURITY: Clamp cloud-provided values to local config limits
            var clampedTimeout = Math.Min(payload.TimeoutSeconds, _config.DefaultQueryTimeoutSeconds);
            var clampedMaxRows = Math.Min(payload.MaxRows, _config.MaxRowsPerQuery);
            if (clampedTimeout <= 0) clampedTimeout = _config.DefaultQueryTimeoutSeconds;
            if (clampedMaxRows <= 0) clampedMaxRows = _config.MaxRowsPerQuery;

            var queryCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            _queryTokens[envelope.Id] = queryCts;
            try
            {
                var result = await _queryExecutor.ExecuteAsync(
                    payload.Sql,
                    clampedTimeout,
                    clampedMaxRows,
                    queryCts.Token);

                await SendMessageAsync(MessageSerializer.CreateQueryResult(envelope.Id, result), ct);
            }
            finally
            {
                _queryTokens.TryRemove(envelope.Id, out _);
            }
        }
        catch (InvalidOperationException ex)
        {
            // Validation failure or concurrency limit
            _logger.Warning(ex, "Query validation failed (id: {Id})", envelope.Id);
            await SendMessageAsync(
                MessageSerializer.CreateErrorMessage(envelope.Id, "QUERY_VALIDATION_FAILED", "Query validation failed"),
                ct);
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Query execution failed (id: {Id})", envelope.Id);
            // SECURITY: Never send raw exception messages to cloud — they may contain
            // server names, file paths, or connection details
            await SendMessageAsync(
                MessageSerializer.CreateErrorMessage(envelope.Id, "SQL_ERROR", "Query execution failed"),
                ct);
        }
    }

    private async Task HandleHealthPingAsync(MessageEnvelope envelope, CancellationToken ct)
    {
        if ((DateTime.UtcNow - _lastHealthPong).TotalSeconds < 5) return; // Throttle health pongs
        _lastHealthPong = DateTime.UtcNow;

        var sqlHealthy = await _sqlConnection.TestConnectionAsync(ct);
        var health = new HealthPongPayload
        {
            UptimeSeconds = (long)(DateTime.UtcNow - _startTime).TotalSeconds,
            SqlServerConnected = sqlHealthy,
            ActiveQueries = _queryExecutor.ActiveQueries,
            MemoryMb = 0, // Removed for security — don't reveal process memory to cloud
            Version = "0.1.0",
        };

        await SendMessageAsync(MessageSerializer.CreateHealthPong(envelope.Id, health), ct);
    }

    private async Task SendMessageAsync(MessageEnvelope message, CancellationToken ct)
    {
        if (_ws?.State != WebSocketState.Open) return;

        await _sendLock.WaitAsync(ct);
        try
        {
            var json = MessageSerializer.Serialize(message);
            var bytes = Encoding.UTF8.GetBytes(json);
            await _ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, ct);
        }
        finally
        {
            _sendLock.Release();
        }
    }

    private async Task ReconnectWithBackoffAsync(CancellationToken ct)
    {
        var delay = _config.ReconnectInitialDelayMs;
        var attempt = 0;

        while (!ct.IsCancellationRequested)
        {
            attempt++;
            var jitter = Random.Shared.Next(0, delay / 2);
            var totalDelay = delay + jitter;

            _logger.Information("Reconnect attempt {Attempt} in {Delay}ms", attempt, totalDelay);
            await Task.Delay(totalDelay, ct);

            try
            {
                await ConnectAndRunAsync(ct);
                return;
            }
            catch (Exception ex) when (!ct.IsCancellationRequested)
            {
                _logger.Warning(ex, "Reconnect attempt {Attempt} failed", attempt);
                delay = Math.Min(delay * 2, _config.ReconnectMaxDelayMs);
            }
        }
    }

    public async Task DisconnectAsync()
    {
        _isConnected = false;
        if (_ws?.State == WebSocketState.Open)
        {
            await _ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "Shutting down", CancellationToken.None);
        }
        _ws?.Dispose();
    }
}
