using ApuraConnector.Core.Models;
using ApuraConnector.Infrastructure.Credentials;

namespace ApuraConnector.Core.Tests;

public class DpapiCredentialStoreTests
{
    [Fact]
    public void Constructor_ThrowsPlatformNotSupportedException_OnNonWindows()
    {
        if (OperatingSystem.IsWindows())
            return; // Skip on Windows -- this test is for non-Windows platforms

        var tempFile = Path.Combine(Path.GetTempPath(), "test-creds.dpapi");
        Assert.Throws<PlatformNotSupportedException>(
            () => new DpapiCredentialStore(tempFile));
    }

    [Fact]
    public void SaveAndLoad_RoundTrip_ReturnsIdenticalConfig()
    {
        if (!OperatingSystem.IsWindows())
            return; // DPAPI only available on Windows

        var tempFile = Path.Combine(Path.GetTempPath(), $"test-creds-{Guid.NewGuid()}.dpapi");
        try
        {
            var store = new DpapiCredentialStore(tempFile);
            var original = new SqlServerConfig
            {
                ServerName = "test-server\\INSTANCE",
                DatabaseName = "TestDB",
                UseWindowsAuth = false,
                Username = "sa",
                Password = "S3cret!Pass",
                ConnectionTimeoutSeconds = 30,
                MinPoolSize = 5,
                MaxPoolSize = 50,
                TrustServerCertificate = false
            };

            store.SaveCredentials(original);
            var loaded = store.LoadCredentials();

            Assert.Equal(original.ServerName, loaded.ServerName);
            Assert.Equal(original.DatabaseName, loaded.DatabaseName);
            Assert.Equal(original.UseWindowsAuth, loaded.UseWindowsAuth);
            Assert.Equal(original.Username, loaded.Username);
            Assert.Equal(original.Password, loaded.Password);
            Assert.Equal(original.ConnectionTimeoutSeconds, loaded.ConnectionTimeoutSeconds);
            Assert.Equal(original.MinPoolSize, loaded.MinPoolSize);
            Assert.Equal(original.MaxPoolSize, loaded.MaxPoolSize);
            Assert.Equal(original.TrustServerCertificate, loaded.TrustServerCertificate);
        }
        finally
        {
            if (File.Exists(tempFile))
                File.Delete(tempFile);
        }
    }

    [Fact]
    public void SaveCredentials_CreatesFileAtSpecifiedPath()
    {
        if (!OperatingSystem.IsWindows())
            return;

        var tempFile = Path.Combine(Path.GetTempPath(), $"test-creds-{Guid.NewGuid()}.dpapi");
        try
        {
            var store = new DpapiCredentialStore(tempFile);
            store.SaveCredentials(new SqlServerConfig { ServerName = "srv", DatabaseName = "db" });
            Assert.True(File.Exists(tempFile));
        }
        finally
        {
            if (File.Exists(tempFile))
                File.Delete(tempFile);
        }
    }

    [Fact]
    public void LoadCredentials_ThrowsFileNotFoundException_ForMissingFile()
    {
        if (!OperatingSystem.IsWindows())
            return;

        var store = new DpapiCredentialStore("/nonexistent/path/creds.dpapi");
        Assert.Throws<FileNotFoundException>(() => store.LoadCredentials());
    }

    [Fact]
    public void LoadCredentials_ThrowsCryptographicException_ForCorruptedFile()
    {
        if (!OperatingSystem.IsWindows())
            return;

        var tempFile = Path.Combine(Path.GetTempPath(), $"test-corrupt-{Guid.NewGuid()}.dpapi");
        try
        {
            File.WriteAllBytes(tempFile, new byte[] { 0x00, 0x01, 0x02, 0x03 });
            var store = new DpapiCredentialStore(tempFile);
            Assert.ThrowsAny<System.Security.Cryptography.CryptographicException>(
                () => store.LoadCredentials());
        }
        finally
        {
            if (File.Exists(tempFile))
                File.Delete(tempFile);
        }
    }
}
