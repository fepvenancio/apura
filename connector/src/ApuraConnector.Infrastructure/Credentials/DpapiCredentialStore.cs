using System.Runtime.Versioning;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ApuraConnector.Core.Models;

namespace ApuraConnector.Infrastructure.Credentials;

public class DpapiCredentialStore
{
    private readonly string _credentialFilePath;
    private static readonly byte[] Entropy =
        Encoding.UTF8.GetBytes("ApuraConnector.Credentials.v1");

    public DpapiCredentialStore(string credentialFilePath)
    {
        if (!OperatingSystem.IsWindows())
            throw new PlatformNotSupportedException(
                "DPAPI credential storage is only supported on Windows.");
        _credentialFilePath = credentialFilePath;
    }

    [SupportedOSPlatform("windows")]
    public void SaveCredentials(SqlServerConfig config)
    {
        var json = JsonSerializer.Serialize(config);
        var plaintext = Encoding.UTF8.GetBytes(json);
        var encrypted = ProtectedData.Protect(
            plaintext, Entropy, DataProtectionScope.LocalMachine);
        var directory = Path.GetDirectoryName(_credentialFilePath);
        if (!string.IsNullOrEmpty(directory))
            Directory.CreateDirectory(directory);
        File.WriteAllBytes(_credentialFilePath, encrypted);
    }

    [SupportedOSPlatform("windows")]
    public SqlServerConfig LoadCredentials()
    {
        if (!File.Exists(_credentialFilePath))
            throw new FileNotFoundException(
                "Credential file not found.", _credentialFilePath);

        var encrypted = File.ReadAllBytes(_credentialFilePath);
        var plaintext = ProtectedData.Unprotect(
            encrypted, Entropy, DataProtectionScope.LocalMachine);
        var json = Encoding.UTF8.GetString(plaintext);
        return JsonSerializer.Deserialize<SqlServerConfig>(json)
            ?? throw new InvalidOperationException(
                "Failed to deserialize credentials.");
    }
}
