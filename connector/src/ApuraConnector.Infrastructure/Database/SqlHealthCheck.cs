using Serilog;

namespace ApuraConnector.Infrastructure.Database;

public class SqlHealthCheck
{
    private readonly SqlServerConnection _connection;
    private readonly ILogger _logger;

    public bool IsHealthy { get; private set; }
    public DateTime LastCheck { get; private set; }

    public SqlHealthCheck(SqlServerConnection connection, ILogger logger)
    {
        _connection = connection;
        _logger = logger;
    }

    public async Task CheckAsync(CancellationToken ct = default)
    {
        IsHealthy = await _connection.TestConnectionAsync(ct);
        LastCheck = DateTime.UtcNow;

        if (!IsHealthy)
            _logger.Warning("SQL Server health check failed at {Time}", LastCheck);
    }
}
