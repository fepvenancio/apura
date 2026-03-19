using System.Diagnostics;
using System.Net.Http.Json;
using Serilog;

namespace ApuraConnector.Infrastructure.Updates;

public class UpdateChecker
{
    private readonly HttpClient _httpClient;
    private readonly string _versionEndpoint;
    private readonly string _currentVersion;
    private readonly ILogger _logger;

    public UpdateChecker(
        HttpClient httpClient,
        string versionEndpoint,
        string currentVersion,
        ILogger logger)
    {
        _httpClient = httpClient;
        _versionEndpoint = versionEndpoint;
        _currentVersion = currentVersion;
        _logger = logger;
    }

    public async Task<UpdateResult?> CheckForUpdateAsync(CancellationToken ct = default)
    {
        try
        {
            var response = await _httpClient.GetAsync(_versionEndpoint, ct);
            response.EnsureSuccessStatusCode();

            var info = await response.Content.ReadFromJsonAsync<UpdateInfo>(
                cancellationToken: ct);

            if (info == null)
            {
                _logger.Warning("Version endpoint returned null");
                return null;
            }

            var latestVersion = Version.Parse(info.LatestVersion);
            var currentVersion = Version.Parse(_currentVersion);

            if (latestVersion > currentVersion)
            {
                var forceUpdate = info.MinVersion != null
                    && currentVersion < Version.Parse(info.MinVersion);

                _logger.Information(
                    "Update available: {Current} -> {Latest} (force={Force})",
                    _currentVersion, info.LatestVersion, forceUpdate);

                return new UpdateResult(info, forceUpdate);
            }

            _logger.Debug("No update available. Current={Current}, Latest={Latest}",
                _currentVersion, info.LatestVersion);
            return null;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.Warning(ex, "Failed to check for updates");
            return null;
        }
    }

    public async Task<string> DownloadUpdateAsync(
        UpdateInfo info, CancellationToken ct = default)
    {
        var tempMsi = Path.Combine(
            Path.GetTempPath(), $"ApuraConnector-{info.LatestVersion}.msi");

        _logger.Information("Downloading update to {Path}", tempMsi);

        using var stream = await _httpClient.GetStreamAsync(info.DownloadUrl, ct);
        using var file = File.Create(tempMsi);
        await stream.CopyToAsync(file, ct);

        _logger.Information("Download complete: {Path}", tempMsi);
        return tempMsi;
    }

    public void ApplyUpdate(string msiPath)
    {
        _logger.Information("Scheduling update from {Path}", msiPath);

        var taskName = "ApuraConnectorUpdate";
        var msiArgs = $"/i \"{msiPath}\" /quiet /norestart /l*v \"{msiPath}.log\"";
        var scheduleArgs = $"/Create /TN \"{taskName}\" /TR \"msiexec {msiArgs}\" " +
                           "/SC ONCE /ST 00:00 /SD 01/01/2099 /RU SYSTEM /F /RL HIGHEST";

        var createProcess = Process.Start(new ProcessStartInfo
        {
            FileName = "schtasks",
            Arguments = scheduleArgs,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        });

        createProcess?.WaitForExit(30_000);

        // Run the task immediately
        var runProcess = Process.Start(new ProcessStartInfo
        {
            FileName = "schtasks",
            Arguments = $"/Run /TN \"{taskName}\"",
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        });

        runProcess?.WaitForExit(30_000);

        _logger.Information("Update scheduled via schtasks. " +
                            "The service will be stopped and restarted by MSI.");
    }
}

public record UpdateResult(UpdateInfo Info, bool ForceUpdate);
