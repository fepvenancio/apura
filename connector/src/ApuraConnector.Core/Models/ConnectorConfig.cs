namespace ApuraConnector.Core.Models;

public class ConnectorConfig
{
    public string ApiKey { get; set; } = "";
    public string TunnelEndpoint { get; set; } = "wss://apura-ws.stela-app.workers.dev/agent/connect";
    public string ApiBaseUrl { get; set; } = "https://apura-api.stela-app.workers.dev";
    public int MaxConcurrentQueries { get; set; } = 5;
    public int MaxRowsPerQuery { get; set; } = 10000;
    public int DefaultQueryTimeoutSeconds { get; set; } = 30;
    public int HeartbeatIntervalSeconds { get; set; } = 30;
    public int ReconnectInitialDelayMs { get; set; } = 1000;
    public int ReconnectMaxDelayMs { get; set; } = 120000;

    // Auto-update settings
    public int UpdateCheckIntervalHours { get; set; } = 6;

    // Client certificate for mTLS
    public string? ClientCertificatePath { get; set; }
    public string? ClientCertificatePassword { get; set; }
    public string? ClientCertificateThumbprint { get; set; }

    public string GetVersionEndpoint() => $"{ApiBaseUrl.TrimEnd('/')}/connector/version";
}

public class SqlServerConfig
{
    public string ServerName { get; set; } = "";
    public string DatabaseName { get; set; } = "";
    public bool UseWindowsAuth { get; set; } = false;
    public string? Username { get; set; }
    public string? Password { get; set; }
    public int ConnectionTimeoutSeconds { get; set; } = 15;
    public int MinPoolSize { get; set; } = 2;
    public int MaxPoolSize { get; set; } = 20;
    public bool TrustServerCertificate { get; set; } = true;
}
