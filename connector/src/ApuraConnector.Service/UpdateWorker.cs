using ApuraConnector.Core.Models;
using ApuraConnector.Infrastructure.Updates;
using Serilog;

namespace ApuraConnector.Service;

public class UpdateWorker : BackgroundService
{
    private readonly UpdateChecker _updateChecker;
    private readonly ConnectorConfig _config;
    private readonly Serilog.ILogger _logger;

    public UpdateWorker(
        UpdateChecker updateChecker,
        ConnectorConfig config)
    {
        _updateChecker = updateChecker;
        _config = config;
        _logger = Log.ForContext<UpdateWorker>();
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.Information("Update worker starting. Check interval: {Hours}h",
            _config.UpdateCheckIntervalHours);

        // Wait 5 minutes before first check to let the service fully start
        try
        {
            await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
        }
        catch (OperationCanceledException)
        {
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                _logger.Information("Checking for updates...");
                var result = await _updateChecker.CheckForUpdateAsync(stoppingToken);

                if (result != null)
                {
                    _logger.Information(
                        "Update available: {Version} (force={Force})",
                        result.Info.LatestVersion, result.ForceUpdate);

                    var msiPath = await _updateChecker.DownloadUpdateAsync(
                        result.Info, stoppingToken);
                    _updateChecker.ApplyUpdate(msiPath);

                    _logger.Information(
                        "Update to {Version} has been scheduled. " +
                        "The service will be restarted by the installer.",
                        result.Info.LatestVersion);

                    // After scheduling an update, stop checking
                    return;
                }
                else
                {
                    _logger.Information("No updates available.");
                }
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Error during update check. Will retry next interval.");
            }

            try
            {
                await Task.Delay(
                    TimeSpan.FromHours(_config.UpdateCheckIntervalHours),
                    stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }

        _logger.Information("Update worker stopping.");
    }
}
