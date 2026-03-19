using ApuraConnector.Core.Models;
using ApuraConnector.Core.Validation;
using ApuraConnector.Infrastructure.Credentials;
using ApuraConnector.Infrastructure.Database;
using ApuraConnector.Infrastructure.Tunnel;
using ApuraConnector.Infrastructure.Updates;
using ApuraConnector.Service;
using Serilog;

Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    .WriteTo.Console(outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj}{NewLine}{Exception}")
    .WriteTo.File(
        path: Path.Combine(AppContext.BaseDirectory, "logs", "connector-.log"),
        rollingInterval: RollingInterval.Day,
        retainedFileCountLimit: 30)
    .CreateLogger();

try
{
    Log.Information("Apura Connector v1.0.0 starting...");

    var builder = Host.CreateApplicationBuilder(args);

    // Windows Service support (SCM integration)
    builder.Services.AddWindowsService(options =>
    {
        options.ServiceName = "ApuraConnector";
    });

    builder.Services.AddSerilog();

    // Load configuration
    var connectorConfig = builder.Configuration
        .GetSection("Connector")
        .Get<ConnectorConfig>() ?? new ConnectorConfig();

    // Load SQL credentials: prefer DPAPI-encrypted file, fall back to appsettings.json
    SqlServerConfig sqlConfig;
    var credStorePath = Path.Combine(AppContext.BaseDirectory, "credentials.dpapi");
    if (OperatingSystem.IsWindows() && File.Exists(credStorePath))
    {
        Log.Information("Loading SQL credentials from DPAPI-encrypted store");
        try
        {
            var credStore = new DpapiCredentialStore(credStorePath);
            sqlConfig = credStore.LoadCredentials();
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to load DPAPI credentials, falling back to appsettings.json");
            sqlConfig = builder.Configuration
                .GetSection("SqlServer")
                .Get<SqlServerConfig>() ?? new SqlServerConfig();
        }
    }
    else
    {
        Log.Information("Loading SQL credentials from appsettings.json");
        sqlConfig = builder.Configuration
            .GetSection("SqlServer")
            .Get<SqlServerConfig>() ?? new SqlServerConfig();
    }

    // Check if configuration is complete
    var isConfigured = !string.IsNullOrEmpty(connectorConfig.ApiKey)
        && !string.IsNullOrEmpty(sqlConfig.ServerName)
        && !string.IsNullOrEmpty(sqlConfig.DatabaseName);

    if (!isConfigured)
    {
        Log.Warning("=============================================================");
        Log.Warning("  Apura Connector is not configured.");
        Log.Warning("  Run ApuraConnector.Setup.exe to configure the connector.");
        Log.Warning("  The service will wait for configuration...");
        Log.Warning("=============================================================");
    }

    // Register services
    builder.Services.AddSingleton(connectorConfig);
    builder.Services.AddSingleton(sqlConfig);
    builder.Services.AddSingleton(sp => new SqlServerConnection(sqlConfig, Log.Logger));
    builder.Services.AddSingleton<SqlValidator>();
    builder.Services.AddSingleton(sp =>
        new QueryExecutor(
            sp.GetRequiredService<SqlServerConnection>(),
            sp.GetRequiredService<SqlValidator>(),
            Log.Logger,
            connectorConfig.MaxConcurrentQueries,
            connectorConfig.MaxRowsPerQuery));
    builder.Services.AddSingleton(sp =>
        new CloudTunnelService(
            connectorConfig,
            sp.GetRequiredService<QueryExecutor>(),
            sp.GetRequiredService<SqlServerConnection>(),
            Log.Logger));
    builder.Services.AddSingleton(sp =>
        new SqlHealthCheck(
            sp.GetRequiredService<SqlServerConnection>(),
            Log.Logger));

    // Register UpdateChecker
    var currentVersion = typeof(Program).Assembly
        .GetCustomAttributes(typeof(System.Reflection.AssemblyInformationalVersionAttribute), false)
        .OfType<System.Reflection.AssemblyInformationalVersionAttribute>()
        .FirstOrDefault()?.InformationalVersion ?? "1.0.0";
    var versionForParsing = currentVersion.Contains('+')
        ? currentVersion[..currentVersion.IndexOf('+')]
        : currentVersion;

    var versionEndpoint = connectorConfig.GetVersionEndpoint();

    builder.Services.AddSingleton(sp =>
        new UpdateChecker(
            new HttpClient(),
            versionEndpoint,
            versionForParsing,
            Log.ForContext<UpdateChecker>()));

    builder.Services.AddHostedService<ConnectorWorker>();
    builder.Services.AddHostedService<UpdateWorker>();

    var host = builder.Build();

    if (isConfigured)
    {
        // Test SQL connection on startup (non-fatal — the service will retry)
        var sqlConn = host.Services.GetRequiredService<SqlServerConnection>();
        var testResult = await sqlConn.TestConnectionAsync();
        if (!testResult)
        {
            Log.Warning("Cannot connect to SQL Server at {Server}/{Database}. The connector will keep retrying.",
                sqlConfig.ServerName, sqlConfig.DatabaseName);
        }
        else
        {
            Log.Information("SQL Server connection verified: {Server}/{Database}",
                sqlConfig.ServerName, sqlConfig.DatabaseName);
        }
    }

    await host.RunAsync();
    return 0;
}
catch (Exception ex)
{
    Log.Fatal(ex, "Connector terminated unexpectedly");
    return 1;
}
finally
{
    await Log.CloseAndFlushAsync();
}
