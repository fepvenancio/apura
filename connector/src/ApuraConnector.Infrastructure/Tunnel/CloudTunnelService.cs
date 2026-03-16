using System.Net.WebSockets;
using System.Text;
using ApuraConnector.Core.Models;
using ApuraConnector.Core.Serialization;
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

        var uri = new Uri(_config.TunnelEndpoint);
        _logger.Information("Connecting to {Endpoint}...", uri);

        await _ws.ConnectAsync(uri, ct);
        _isConnected = true;
        _logger.Information("Connected to Apura cloud");

        // Run receive loop
        await ReceiveLoopAsync(ct);
    }

    private async Task ReceiveLoopAsync(CancellationToken ct)
    {
        var buffer = new byte[64 * 1024]; // 64KB buffer

        while (_ws?.State == WebSocketState.Open && !ct.IsCancellationRequested)
        {
            var result = await _ws.ReceiveAsync(new ArraySegment<byte>(buffer), ct);

            if (result.MessageType == WebSocketMessageType.Close)
            {
                _isConnected = false;
                _logger.Information("Server closed connection: {Status} {Description}",
                    result.CloseStatus, result.CloseStatusDescription);
                break;
            }

            if (result.MessageType == WebSocketMessageType.Text)
            {
                var json = Encoding.UTF8.GetString(buffer, 0, result.Count);
                _ = Task.Run(() => HandleMessageAsync(json, ct), ct);
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
                    _logger.Information("Query cancel requested (not yet implemented)");
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

        _logger.Information("Executing query (id: {Id}): {Sql}", envelope.Id, payload.Sql[..Math.Min(payload.Sql.Length, 100)]);

        try
        {
            var result = await _queryExecutor.ExecuteAsync(
                payload.Sql,
                payload.TimeoutSeconds,
                payload.MaxRows,
                ct);

            await SendMessageAsync(MessageSerializer.CreateQueryResult(envelope.Id, result), ct);
        }
        catch (InvalidOperationException ex)
        {
            // Validation failure or concurrency limit
            await SendMessageAsync(
                MessageSerializer.CreateErrorMessage(envelope.Id, "QUERY_VALIDATION_FAILED", ex.Message),
                ct);
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Query execution failed (id: {Id})", envelope.Id);
            await SendMessageAsync(
                MessageSerializer.CreateErrorMessage(envelope.Id, "SQL_ERROR", ex.Message),
                ct);
        }
    }

    private async Task HandleHealthPingAsync(MessageEnvelope envelope, CancellationToken ct)
    {
        var sqlHealthy = await _sqlConnection.TestConnectionAsync(ct);
        var health = new HealthPongPayload
        {
            UptimeSeconds = (long)(DateTime.UtcNow - _startTime).TotalSeconds,
            SqlServerConnected = sqlHealthy,
            ActiveQueries = _queryExecutor.ActiveQueries,
            MemoryMb = Environment.WorkingSet / (1024 * 1024),
            Version = "0.1.0",
        };

        await SendMessageAsync(MessageSerializer.CreateHealthPong(envelope.Id, health), ct);
    }

    private async Task SendMessageAsync(MessageEnvelope message, CancellationToken ct)
    {
        if (_ws?.State != WebSocketState.Open) return;

        var json = MessageSerializer.Serialize(message);
        var bytes = Encoding.UTF8.GetBytes(json);

        await _ws.SendAsync(
            new ArraySegment<byte>(bytes),
            WebSocketMessageType.Text,
            endOfMessage: true,
            ct);
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
