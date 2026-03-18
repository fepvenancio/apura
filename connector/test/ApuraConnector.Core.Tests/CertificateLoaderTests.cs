using ApuraConnector.Core.Models;
using ApuraConnector.Infrastructure.Certificates;

namespace ApuraConnector.Core.Tests;

public class CertificateLoaderTests
{
    [Fact]
    public void Load_ReturnsNull_WhenClientCertificatePathIsNull()
    {
        var config = new ConnectorConfig { ClientCertificatePath = null };

        var result = CertificateLoader.Load(config);

        Assert.Null(result);
    }

    [Fact]
    public void Load_ReturnsNull_WhenClientCertificatePathIsEmpty()
    {
        var config = new ConnectorConfig { ClientCertificatePath = "" };

        var result = CertificateLoader.Load(config);

        Assert.Null(result);
    }

    [Fact]
    public void Load_ThrowsFileNotFoundException_WhenFileDoesNotExist()
    {
        var config = new ConnectorConfig
        {
            ClientCertificatePath = "/nonexistent/path/cert.pfx"
        };

        var ex = Assert.Throws<FileNotFoundException>(() => CertificateLoader.Load(config));
        Assert.Contains("cert.pfx", ex.Message);
    }
}
