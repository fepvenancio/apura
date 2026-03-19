namespace ApuraConnector.Infrastructure.Updates;

public record UpdateInfo(
    string LatestVersion,
    string DownloadUrl,
    string? ReleaseNotes,
    string? Checksum,
    string? MinVersion);
