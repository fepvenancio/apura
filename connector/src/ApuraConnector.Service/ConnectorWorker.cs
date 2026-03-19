using ApuraConnector.Core.Models;
using ApuraConnector.Infrastructure.Database;
using ApuraConnector.Infrastructure.Tunnel;
using Serilog;

namespace ApuraConnector.Service;

public class ConnectorWorker : BackgroundService
{
    private readonly CloudTunnelService _tunnel;
    private readonly SqlHealthCheck _healthCheck;
    private readonly ConnectorConfig _config;
    private readonly Serilog.ILogger _logger;

    public ConnectorWorker(
        CloudTunnelService tunnel,
        SqlHealthCheck healthCheck,
        ConnectorConfig config)
    {
        _tunnel = tunnel;
        _healthCheck = healthCheck;
        _config = config;
        _logger = Log.ForContext<ConnectorWorker>();
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.Information("Connector worker starting...");

        // Wait for configuration before connecting
        if (string.IsNullOrEmpty(_config.ApiKey))
        {
            _logger.Warning("No API key configured. Waiting for setup...");
            while (!stoppingToken.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
                // Could reload config here in the future
            }
            return;
        }

        // Start health check loop in background
        _ = RunHealthCheckLoopAsync(stoppingToken);

        // Start tunnel (blocks until cancelled)
        await _tunnel.RunAsync(stoppingToken);
    }

    private async Task RunHealthCheckLoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await _healthCheck.CheckAsync(ct);
            }
            catch (Exception ex) when (!ct.IsCancellationRequested)
            {
                _logger.Warning(ex, "Health check error");
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(30), ct);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.Information("Connector worker stopping...");
        await _tunnel.DisconnectAsync();
        await base.StopAsync(cancellationToken);
    }
}
