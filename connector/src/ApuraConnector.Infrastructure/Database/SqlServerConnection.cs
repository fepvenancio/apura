using Microsoft.Data.SqlClient;
using ApuraConnector.Core.Models;
using Serilog;

namespace ApuraConnector.Infrastructure.Database;

public class SqlServerConnection : IDisposable
{
    private readonly SqlServerConfig _config;
    private readonly ILogger _logger;
    private string _connectionString;

    public SqlServerConnection(SqlServerConfig config, ILogger logger)
    {
        _config = config;
        _logger = logger;
        _connectionString = BuildConnectionString();
    }

    private string BuildConnectionString()
    {
        var builder = new SqlConnectionStringBuilder
        {
            DataSource = _config.ServerName,
            InitialCatalog = _config.DatabaseName,
            IntegratedSecurity = _config.UseWindowsAuth,
            Encrypt = SqlConnectionEncryptOption.Optional,
            TrustServerCertificate = _config.TrustServerCertificate,
            ConnectTimeout = _config.ConnectionTimeoutSeconds,
            ApplicationName = "Apura Connector",
            MinPoolSize = _config.MinPoolSize,
            MaxPoolSize = _config.MaxPoolSize,
            MultipleActiveResultSets = false,
        };

        if (!_config.UseWindowsAuth)
        {
            builder.UserID = _config.Username;
            builder.Password = _config.Password;
        }

        return builder.ConnectionString;
    }

    public async Task<bool> TestConnectionAsync(CancellationToken ct = default)
    {
        try
        {
            await using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync(ct);
            await using var cmd = new SqlCommand("SELECT 1", conn);
            await cmd.ExecuteScalarAsync(ct);
            return true;
        }
        catch (Exception ex)
        {
            _logger.Warning(ex, "SQL Server connection test failed");
            return false;
        }
    }

    public SqlConnection CreateConnection() => new(_connectionString);

    public void Dispose() { /* Connection pool is managed by SqlClient */ }
}
