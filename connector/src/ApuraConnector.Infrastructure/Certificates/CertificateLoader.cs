using System.Security.Cryptography.X509Certificates;
using ApuraConnector.Core.Models;

namespace ApuraConnector.Infrastructure.Certificates;

public static class CertificateLoader
{
    /// <summary>
    /// Loads a client certificate from PFX file based on connector config.
    /// Returns null if no certificate path is configured.
    /// </summary>
    public static X509Certificate2? Load(ConnectorConfig config)
    {
        if (string.IsNullOrEmpty(config.ClientCertificatePath))
        {
            return null;
        }

        if (!File.Exists(config.ClientCertificatePath))
        {
            throw new FileNotFoundException(
                $"Client certificate file not found: {config.ClientCertificatePath}",
                config.ClientCertificatePath);
        }

        return new X509Certificate2(
            config.ClientCertificatePath,
            config.ClientCertificatePassword,
            X509KeyStorageFlags.EphemeralKeySet);
    }
}
