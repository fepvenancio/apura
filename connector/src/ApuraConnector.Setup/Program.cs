using System.ServiceProcess;
using System.Text.Json;
using System.Text.Json.Nodes;
using ApuraConnector.Core.Models;
using ApuraConnector.Infrastructure.Credentials;
using ApuraConnector.Infrastructure.Database;
using Microsoft.Data.SqlClient;
using Serilog;

// Simple logger for setup
Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    .WriteTo.Console()
    .CreateLogger();

Console.Title = "Apura Connector Setup";

Console.WriteLine();
Console.WriteLine("  ╔══════════════════════════════════════════╗");
Console.WriteLine("  ║        Apura Connector Setup v1.0        ║");
Console.WriteLine("  ╚══════════════════════════════════════════╝");
Console.WriteLine();

// Detect install directory
var installDir = FindInstallDir();
if (installDir == null)
{
    Console.ForegroundColor = ConsoleColor.Red;
    Console.WriteLine("  Could not find Apura Connector installation.");
    Console.WriteLine("  Please install the connector first using the MSI installer.");
    Console.ResetColor();
    WaitForExit(1);
    return 1;
}

Console.WriteLine($"  Install directory: {installDir}");
Console.WriteLine();

// Step 1: API Key
Console.ForegroundColor = ConsoleColor.Cyan;
Console.WriteLine("  Step 1: API Key");
Console.ResetColor();
Console.WriteLine("  Get your API key from the Apura dashboard (https://apura.xyz)");
Console.WriteLine();

var configPath = Path.Combine(installDir, "appsettings.json");
var existingConfig = LoadExistingConfig(configPath);
var existingApiKey = existingConfig.Connector?.ApiKey ?? "";

string apiKey;
if (!string.IsNullOrEmpty(existingApiKey))
{
    var masked = existingApiKey[..Math.Min(10, existingApiKey.Length)] + "...";
    Console.Write($"  API Key [{masked}]: ");
    var input = Console.ReadLine()?.Trim() ?? "";
    apiKey = string.IsNullOrEmpty(input) ? existingApiKey : input;
}
else
{
    Console.Write("  API Key: ");
    apiKey = Console.ReadLine()?.Trim() ?? "";
}

if (string.IsNullOrEmpty(apiKey))
{
    Console.ForegroundColor = ConsoleColor.Red;
    Console.WriteLine("  API key is required.");
    Console.ResetColor();
    WaitForExit(1);
    return 1;
}

Console.ForegroundColor = ConsoleColor.Green;
Console.WriteLine("  API key saved.");
Console.ResetColor();
Console.WriteLine();

// Step 2: SQL Server Connection
Console.ForegroundColor = ConsoleColor.Cyan;
Console.WriteLine("  Step 2: SQL Server Connection");
Console.ResetColor();
Console.WriteLine();

var existingSql = existingConfig.SqlServer ?? new SqlServerConfig();

var serverName = Prompt("  Server (e.g. localhost or SERVER\\INSTANCE)", existingSql.ServerName);
var databaseName = Prompt("  Database name", string.IsNullOrEmpty(existingSql.DatabaseName) ? "PRIFIXUS" : existingSql.DatabaseName);

Console.Write($"  Use Windows Authentication? (y/n) [{(existingSql.UseWindowsAuth ? "y" : "n")}]: ");
var authInput = Console.ReadLine()?.Trim().ToLowerInvariant() ?? "";
var useWindowsAuth = authInput switch
{
    "y" or "yes" => true,
    "n" or "no" => false,
    "" => existingSql.UseWindowsAuth,
    _ => existingSql.UseWindowsAuth,
};

string? username = null;
string? password = null;

if (!useWindowsAuth)
{
    username = Prompt("  Username", existingSql.Username ?? "sa");
    Console.Write("  Password: ");
    password = ReadPassword();
    Console.WriteLine();
    if (string.IsNullOrEmpty(password) && !string.IsNullOrEmpty(existingSql.Password))
    {
        password = existingSql.Password;
        Console.WriteLine("  (keeping existing password)");
    }
}

Console.WriteLine();

// Step 3: Test SQL Connection
Console.ForegroundColor = ConsoleColor.Cyan;
Console.WriteLine("  Step 3: Testing SQL Server connection...");
Console.ResetColor();

var sqlConfig = new SqlServerConfig
{
    ServerName = serverName,
    DatabaseName = databaseName,
    UseWindowsAuth = useWindowsAuth,
    Username = username,
    Password = password,
    TrustServerCertificate = true,
    ConnectionTimeoutSeconds = 10,
};

var sqlConn = new SqlServerConnection(sqlConfig, Log.Logger);
var sqlOk = await sqlConn.TestConnectionAsync();

if (!sqlOk)
{
    Console.ForegroundColor = ConsoleColor.Red;
    Console.WriteLine("  FAILED: Cannot connect to SQL Server.");
    Console.ResetColor();
    Console.Write("  Continue anyway? (y/n): ");
    var cont = Console.ReadLine()?.Trim().ToLowerInvariant();
    if (cont != "y" && cont != "yes")
    {
        WaitForExit(1);
        return 1;
    }
}
else
{
    Console.ForegroundColor = ConsoleColor.Green;
    Console.WriteLine($"  Connected to {serverName}/{databaseName}");
    Console.ResetColor();

    // Count tables to verify it's a Primavera database
    try
    {
        await using var conn = sqlConn.CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new SqlCommand(
            "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'", conn);
        var tableCount = (int)(await cmd.ExecuteScalarAsync() ?? 0);
        Console.WriteLine($"  Found {tableCount} tables in database.");
    }
    catch { /* non-critical */ }
}

Console.WriteLine();

// Step 4: Test API connectivity
Console.ForegroundColor = ConsoleColor.Cyan;
Console.WriteLine("  Step 4: Testing API connectivity...");
Console.ResetColor();

var apiBaseUrl = "https://apura-api.stela-app.workers.dev";
try
{
    using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
    var response = await http.GetAsync($"{apiBaseUrl}/connector/version");
    if (response.IsSuccessStatusCode)
    {
        var versionJson = await response.Content.ReadAsStringAsync();
        Console.ForegroundColor = ConsoleColor.Green;
        Console.WriteLine($"  API is reachable. Response: {versionJson}");
        Console.ResetColor();
    }
    else
    {
        Console.ForegroundColor = ConsoleColor.Yellow;
        Console.WriteLine($"  API returned status {response.StatusCode}");
        Console.ResetColor();
    }
}
catch (Exception ex)
{
    Console.ForegroundColor = ConsoleColor.Yellow;
    Console.WriteLine($"  Warning: Could not reach API: {ex.Message}");
    Console.WriteLine("  The connector will retry when the service starts.");
    Console.ResetColor();
}

Console.WriteLine();

// Step 5: Save configuration
Console.ForegroundColor = ConsoleColor.Cyan;
Console.WriteLine("  Step 5: Saving configuration...");
Console.ResetColor();

try
{
    // Save appsettings.json (API key + connector settings)
    var configJson = new JsonObject
    {
        ["Connector"] = new JsonObject
        {
            ["ApiKey"] = apiKey,
            ["TunnelEndpoint"] = "wss://ws.apura.xyz/agent/connect",
            ["ApiBaseUrl"] = apiBaseUrl,
            ["MaxConcurrentQueries"] = 5,
            ["MaxRowsPerQuery"] = 10000,
            ["DefaultQueryTimeoutSeconds"] = 30,
            ["HeartbeatIntervalSeconds"] = 30,
            ["ReconnectInitialDelayMs"] = 1000,
            ["ReconnectMaxDelayMs"] = 120000,
        },
        ["SqlServer"] = new JsonObject
        {
            ["ServerName"] = serverName,
            ["DatabaseName"] = databaseName,
            ["UseWindowsAuth"] = useWindowsAuth,
            ["Username"] = username ?? "",
            ["Password"] = "", // Don't store password in plaintext
            ["ConnectionTimeoutSeconds"] = 15,
            ["MinPoolSize"] = 2,
            ["MaxPoolSize"] = 20,
            ["TrustServerCertificate"] = true,
        },
        ["Logging"] = new JsonObject
        {
            ["LogLevel"] = new JsonObject
            {
                ["Default"] = "Information",
                ["Microsoft.Hosting.Lifetime"] = "Information",
            },
        },
    };

    // If using Windows Auth, no password needed
    if (useWindowsAuth)
    {
        configJson["SqlServer"]!["Password"] = "";
    }

    var jsonOptions = new JsonSerializerOptions { WriteIndented = true };
    File.WriteAllText(configPath, configJson.ToJsonString(jsonOptions));
    Console.WriteLine($"  Saved {configPath}");

    // Save SQL credentials via DPAPI (encrypted)
    if (OperatingSystem.IsWindows() && !useWindowsAuth)
    {
        var fullSqlConfig = new SqlServerConfig
        {
            ServerName = serverName,
            DatabaseName = databaseName,
            UseWindowsAuth = false,
            Username = username,
            Password = password,
            ConnectionTimeoutSeconds = 15,
            MinPoolSize = 2,
            MaxPoolSize = 20,
            TrustServerCertificate = true,
        };

        var credPath = Path.Combine(installDir, "credentials.dpapi");
        var credStore = new DpapiCredentialStore(credPath);
        credStore.SaveCredentials(fullSqlConfig);
        Console.WriteLine($"  Saved encrypted credentials to {credPath}");
    }

    Console.ForegroundColor = ConsoleColor.Green;
    Console.WriteLine("  Configuration saved successfully!");
    Console.ResetColor();
}
catch (Exception ex)
{
    Console.ForegroundColor = ConsoleColor.Red;
    Console.WriteLine($"  Error saving configuration: {ex.Message}");
    Console.ResetColor();
    WaitForExit(1);
    return 1;
}

Console.WriteLine();

// Step 6: Restart the service
Console.ForegroundColor = ConsoleColor.Cyan;
Console.WriteLine("  Step 6: Starting Apura Connector service...");
Console.ResetColor();

try
{
    if (OperatingSystem.IsWindows())
    {
        RestartService("ApuraConnector");
    }
}
catch (Exception ex)
{
    Console.ForegroundColor = ConsoleColor.Yellow;
    Console.WriteLine($"  Could not restart service: {ex.Message}");
    Console.WriteLine("  Please restart the 'Apura Connector' service manually.");
    Console.ResetColor();
}

Console.WriteLine();
Console.ForegroundColor = ConsoleColor.Green;
Console.WriteLine("  ╔══════════════════════════════════════════╗");
Console.WriteLine("  ║     Setup complete! Connector is ready.  ║");
Console.WriteLine("  ╚══════════════════════════════════════════╝");
Console.ResetColor();
Console.WriteLine();

WaitForExit(0);
return 0;

// --- Helper methods ---

static string? FindInstallDir()
{
    // Check standard install path
    var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
    var standardPath = Path.Combine(programFiles, "Apura", "Apura Connector");
    if (Directory.Exists(standardPath) && File.Exists(Path.Combine(standardPath, "ApuraConnector.Service.exe")))
        return standardPath;

    // Check if running from install directory
    var currentDir = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
    if (File.Exists(Path.Combine(currentDir, "ApuraConnector.Service.exe")))
        return currentDir;

    // Check parent directory (Setup might be in a subfolder)
    var parentDir = Path.GetDirectoryName(currentDir);
    if (parentDir != null && File.Exists(Path.Combine(parentDir, "ApuraConnector.Service.exe")))
        return parentDir;

    return null;
}

static string Prompt(string label, string defaultValue)
{
    if (!string.IsNullOrEmpty(defaultValue))
        Console.Write($"{label} [{defaultValue}]: ");
    else
        Console.Write($"{label}: ");

    var input = Console.ReadLine()?.Trim() ?? "";
    return string.IsNullOrEmpty(input) ? defaultValue : input;
}

static string ReadPassword()
{
    var password = new System.Text.StringBuilder();
    while (true)
    {
        var key = Console.ReadKey(intercept: true);
        if (key.Key == ConsoleKey.Enter) break;
        if (key.Key == ConsoleKey.Backspace && password.Length > 0)
        {
            password.Remove(password.Length - 1, 1);
            Console.Write("\b \b");
        }
        else if (!char.IsControl(key.KeyChar))
        {
            password.Append(key.KeyChar);
            Console.Write("*");
        }
    }
    return password.ToString();
}

static void RestartService(string serviceName)
{
    if (!OperatingSystem.IsWindows()) return;

    try
    {
        using var sc = new ServiceController(serviceName);

        if (sc.Status == ServiceControllerStatus.Running ||
            sc.Status == ServiceControllerStatus.StartPending)
        {
            Console.WriteLine("  Stopping service...");
            sc.Stop();
            sc.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(30));
        }

        Console.WriteLine("  Starting service...");
        sc.Start();
        sc.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(30));

        Console.ForegroundColor = ConsoleColor.Green;
        Console.WriteLine("  Service started successfully!");
        Console.ResetColor();
    }
    catch (InvalidOperationException)
    {
        // Service might not be installed yet (first-time setup before install)
        Console.ForegroundColor = ConsoleColor.Yellow;
        Console.WriteLine("  Service not found. It will start after MSI installation.");
        Console.ResetColor();
    }
}

static void WaitForExit(int code)
{
    Console.WriteLine("  Press any key to exit...");
    Console.ReadKey(intercept: true);
    Environment.Exit(code);
}

static (ConnectorConfig? Connector, SqlServerConfig? SqlServer) LoadExistingConfig(string path)
{
    try
    {
        if (!File.Exists(path)) return (null, null);
        var json = File.ReadAllText(path);
        var doc = JsonDocument.Parse(json);
        var opts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        ConnectorConfig? connector = null;
        SqlServerConfig? sqlServer = null;
        if (doc.RootElement.TryGetProperty("Connector", out var connEl))
            connector = JsonSerializer.Deserialize<ConnectorConfig>(connEl.GetRawText(), opts);
        if (doc.RootElement.TryGetProperty("SqlServer", out var sqlEl))
            sqlServer = JsonSerializer.Deserialize<SqlServerConfig>(sqlEl.GetRawText(), opts);
        return (connector, sqlServer);
    }
    catch
    {
        return (null, null);
    }
}
