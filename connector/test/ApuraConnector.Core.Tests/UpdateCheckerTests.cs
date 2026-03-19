using System.Net;
using System.Text;
using System.Text.Json;
using ApuraConnector.Infrastructure.Updates;
using Serilog;

namespace ApuraConnector.Core.Tests;

/// <summary>
/// A test HTTP message handler that returns configured responses.
/// </summary>
public class MockHttpHandler : HttpMessageHandler
{
    private readonly Func<HttpRequestMessage, HttpResponseMessage> _handler;

    public MockHttpHandler(Func<HttpRequestMessage, HttpResponseMessage> handler)
    {
        _handler = handler;
    }

    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken cancellationToken)
    {
        return Task.FromResult(_handler(request));
    }
}

public class UpdateCheckerTests
{
    private static readonly ILogger TestLogger = new LoggerConfiguration()
        .MinimumLevel.Debug()
        .WriteTo.Console()
        .CreateLogger();

    private static HttpClient CreateMockClient(
        Func<HttpRequestMessage, HttpResponseMessage> handler)
    {
        return new HttpClient(new MockHttpHandler(handler));
    }

    private static HttpResponseMessage JsonResponse(object obj, HttpStatusCode status = HttpStatusCode.OK)
    {
        var json = JsonSerializer.Serialize(obj);
        return new HttpResponseMessage(status)
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json")
        };
    }

    [Fact]
    public async Task CheckForUpdate_ReturnsUpdateInfo_WhenServerVersionNewer()
    {
        var client = CreateMockClient(_ => JsonResponse(new
        {
            LatestVersion = "2.0.0",
            DownloadUrl = "https://example.com/update.msi",
            ReleaseNotes = "New features",
            Checksum = "abc123",
            MinVersion = "1.0.0"
        }));

        var checker = new UpdateChecker(
            client, "https://example.com/version", "1.0.0", TestLogger);

        var result = await checker.CheckForUpdateAsync();

        Assert.NotNull(result);
        Assert.Equal("2.0.0", result.Info.LatestVersion);
        Assert.Equal("https://example.com/update.msi", result.Info.DownloadUrl);
        Assert.False(result.ForceUpdate);
    }

    [Fact]
    public async Task CheckForUpdate_ReturnsNull_WhenServerVersionSameOrOlder()
    {
        var client = CreateMockClient(_ => JsonResponse(new
        {
            LatestVersion = "1.0.0",
            DownloadUrl = "https://example.com/update.msi",
            ReleaseNotes = (string?)null,
            Checksum = (string?)null,
            MinVersion = "0.1.0"
        }));

        var checker = new UpdateChecker(
            client, "https://example.com/version", "1.0.0", TestLogger);

        var result = await checker.CheckForUpdateAsync();

        Assert.Null(result);
    }

    [Fact]
    public async Task CheckForUpdate_ReturnsNull_OnHttpError()
    {
        var client = CreateMockClient(_ =>
            new HttpResponseMessage(HttpStatusCode.InternalServerError));

        var checker = new UpdateChecker(
            client, "https://example.com/version", "1.0.0", TestLogger);

        var result = await checker.CheckForUpdateAsync();

        Assert.Null(result); // Should not throw
    }

    [Fact]
    public async Task CheckForUpdate_ForceUpdate_WhenCurrentBelowMinVersion()
    {
        var client = CreateMockClient(_ => JsonResponse(new
        {
            LatestVersion = "3.0.0",
            DownloadUrl = "https://example.com/update.msi",
            ReleaseNotes = "Critical update",
            Checksum = "def456",
            MinVersion = "2.0.0"
        }));

        var checker = new UpdateChecker(
            client, "https://example.com/version", "1.0.0", TestLogger);

        var result = await checker.CheckForUpdateAsync();

        Assert.NotNull(result);
        Assert.True(result.ForceUpdate);
    }

    [Fact]
    public async Task DownloadUpdate_DownloadsFileToTempPath()
    {
        var msiContent = new byte[] { 0x4D, 0x5A, 0x90, 0x00 }; // Fake MSI header
        var client = CreateMockClient(req =>
        {
            if (req.RequestUri?.ToString().Contains("download") == true)
            {
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new ByteArrayContent(msiContent)
                };
            }
            return new HttpResponseMessage(HttpStatusCode.NotFound);
        });

        var checker = new UpdateChecker(
            client, "https://example.com/version", "1.0.0", TestLogger);

        var info = new UpdateInfo(
            "2.0.0", "https://example.com/download/update.msi",
            null, null, null);

        var path = await checker.DownloadUpdateAsync(info);

        try
        {
            Assert.True(File.Exists(path));
            var downloaded = await File.ReadAllBytesAsync(path);
            Assert.Equal(msiContent, downloaded);
        }
        finally
        {
            if (File.Exists(path))
                File.Delete(path);
        }
    }
}
