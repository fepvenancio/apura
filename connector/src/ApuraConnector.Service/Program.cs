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
    Log.Information("Apura Connector v0.1.0 starting...");

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
        var credStore = new DpapiCredentialStore(credStorePath);
        sqlConfig = credStore.LoadCredentials();
    }
    else
    {
        Log.Information("Loading SQL credentials from appsettings.json");
        sqlConfig = builder.Configuration
            .GetSection("SqlServer")
            .Get<SqlServerConfig>() ?? new SqlServerConfig();
    }

    // Validate required config
    if (string.IsNullOrEmpty(connectorConfig.ApiKey))
    {
        Log.Fatal("Connector API key is not configured. Set Connector:ApiKey in appsettings.json");
        return 1;
    }
    if (string.IsNullOrEmpty(sqlConfig.ServerName) || string.IsNullOrEmpty(sqlConfig.DatabaseName))
    {
        Log.Fatal("SQL Server connection is not configured. Set SqlServer:ServerName and SqlServer:DatabaseName in appsettings.json");
        return 1;
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
    // Strip any +metadata suffix for version parsing
    var versionForParsing = currentVersion.Contains('+')
        ? currentVersion[..currentVersion.IndexOf('+')]
        : currentVersion;

    var tunnelUri = new Uri(connectorConfig.TunnelEndpoint.Replace("wss://", "https://").Replace("ws://", "http://"));
    var versionEndpoint = $"{tunnelUri.Scheme}://{tunnelUri.Host}/connector/version";

    builder.Services.AddSingleton(sp =>
        new UpdateChecker(
            new HttpClient(),
            versionEndpoint,
            versionForParsing,
            Log.ForContext<UpdateChecker>()));

    builder.Services.AddHostedService<ConnectorWorker>();
    builder.Services.AddHostedService<UpdateWorker>();

    var host = builder.Build();

    // Test SQL connection on startup
    var sqlConn = host.Services.GetRequiredService<SqlServerConnection>();
    var testResult = await sqlConn.TestConnectionAsync();
    if (!testResult)
    {
        Log.Fatal("Cannot connect to SQL Server at {Server}/{Database}. Please check your configuration.",
            sqlConfig.ServerName, sqlConfig.DatabaseName);
        return 1;
    }
    Log.Information("SQL Server connection verified: {Server}/{Database}", sqlConfig.ServerName, sqlConfig.DatabaseName);

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
