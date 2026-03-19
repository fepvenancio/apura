# Apura Connector Installation Guide

Enterprise deployment guide for the Apura on-premise database connector.

## System Requirements

| Requirement | Details |
|---|---|
| Operating System | Windows 10, Windows 11, Windows Server 2016, Windows Server 2019, Windows Server 2022 |
| Architecture | x64 (64-bit) |
| .NET Runtime | Not required (bundled in MSI) |
| Network | Outbound TCP port 443 only (HTTPS/WSS to ws.apura.xyz) |
| Database | Network access to Primavera P6 database (SQL Server or Windows Authentication) |
| Disk Space | ~100 MB |

No inbound ports are required. The connector initiates all connections outbound.

## Standard Installation

1. Download `ApuraConnector.msi` from your Apura dashboard.
2. Double-click the MSI to launch the installer wizard.
3. Follow the on-screen prompts to complete installation.

The installer performs the following actions:

- Installs files to `C:\Program Files\Apura\Apura Connector\`
- Registers the **Apura Connector** Windows Service under the `LocalService` account
- Configures the service to start automatically on boot
- Creates an outbound Windows Firewall rule for TCP port 443

After installation, the service starts automatically. Configure it before it can connect (see Configuration below).

## Configuration

Configuration is stored in `appsettings.json` in the installation directory (`C:\Program Files\Apura\Apura Connector\appsettings.json`).

### API Key

Set your organization's API key in `appsettings.json`:

```json
{
  "Connector": {
    "ApiKey": "your-api-key-here",
    "TunnelEndpoint": "wss://ws.apura.xyz/agent/connect"
  }
}
```

Obtain your API key from the Apura dashboard under **Settings > Connectors**.

### SQL Server Credentials

For non-sensitive settings (server name, database name), edit `appsettings.json` directly:

```json
{
  "SqlServer": {
    "ServerName": "your-sql-server",
    "DatabaseName": "your-p6-database",
    "UseWindowsAuth": false,
    "ConnectionTimeoutSeconds": 15
  }
}
```

For SQL Server credentials, use the credential setup tool to store them securely via DPAPI encryption:

```powershell
ApuraConnector.Setup.exe --configure-credentials
```

Credentials are encrypted at rest using Windows DPAPI with LocalMachine scope and stored in `credentials.dpapi` alongside the application. This ensures only processes on the same machine can decrypt them.

For Windows Authentication, set `UseWindowsAuth` to `true` and configure the service to run under a domain account with SQL Server access.

### Restarting After Configuration Changes

After modifying `appsettings.json` or credentials, restart the service:

```powershell
Restart-Service ApuraConnector
```

Or restart via `services.msc` (Services management console).

## Silent / GPO Deployment

### Silent Install

```powershell
msiexec /i ApuraConnector.msi /quiet /norestart /l*v install.log
```

- `/quiet` -- no user interface
- `/norestart` -- suppress reboot (no reboot required)
- `/l*v install.log` -- verbose logging to `install.log`

### Silent Uninstall

```powershell
msiexec /x ApuraConnector.msi /quiet /norestart
```

### Silent Upgrade

Run the install command with the new MSI. The `MajorUpgrade` element handles in-place upgrades automatically -- the previous version is removed and the new version installed:

```powershell
msiexec /i ApuraConnector-v1.1.0.msi /quiet /norestart /l*v upgrade.log
```

### GPO Deployment (Group Policy)

1. Copy the MSI to a network share accessible by target machines.
2. Open **Group Policy Management Console**.
3. Create or edit a GPO linked to the target OU.
4. Navigate to **Computer Configuration > Policies > Software Settings > Software Installation**.
5. Right-click, select **New > Package**, and select the MSI from the network share.
6. Choose **Assigned** deployment method.
7. The MSI installs at next machine startup.

For SCCM/Intune deployments, use the silent install command line above.

### Post-Deployment Configuration

After silent or GPO deployment, configure each connector by placing a pre-configured `appsettings.json` in the install directory, or use a startup script:

```powershell
$configPath = "C:\Program Files\Apura\Apura Connector\appsettings.json"
$config = Get-Content $configPath | ConvertFrom-Json
$config.Connector.ApiKey = "your-api-key"
$config.SqlServer.ServerName = "your-sql-server"
$config.SqlServer.DatabaseName = "your-p6-database"
$config | ConvertTo-Json -Depth 10 | Set-Content $configPath
Restart-Service ApuraConnector
```

## Network and Firewall Requirements

### Required Connectivity

| Direction | Protocol | Port | Destination | Purpose |
|---|---|---|---|---|
| Outbound | TCP | 443 | ws.apura.xyz | WebSocket tunnel (WSS) |
| Outbound | TCP | 443 | api.apura.xyz | API calls, update checks |

**No inbound ports are required.** The connector initiates all connections to the Apura cloud service over outbound HTTPS/WSS on port 443.

### Windows Firewall

The MSI automatically creates a Windows Firewall outbound rule named **"Apura Connector (Outbound HTTPS)"** allowing TCP port 443. No manual firewall configuration is needed on the local machine.

### Enterprise Firewall / Proxy

For environments with restrictive outbound firewalls or proxy servers:

1. **Whitelist** the following domains on your network firewall:
   - `ws.apura.xyz` (WebSocket tunnel)
   - `api.apura.xyz` (API and update endpoints)

2. **Allow outbound TCP port 443** (HTTPS/WSS) to these domains.

3. **Proxy configuration**: If outbound HTTPS traffic must pass through a corporate proxy, configure the proxy in `appsettings.json`:

```json
{
  "Connector": {
    "HttpProxy": "http://proxy.corp.local:8080"
  }
}
```

4. **SSL inspection**: If your proxy performs SSL inspection, ensure the proxy's root CA certificate is installed in the machine's Trusted Root Certification Authorities store.

## Auto-Update

The connector checks for updates automatically:

- Checks every **6 hours** by default (configurable)
- Downloads new MSI versions from the Apura update endpoint
- Installs updates via Windows Task Scheduler with elevated privileges
- The service restarts automatically after upgrade

### Configure Update Interval

In `appsettings.json`, set `UpdateCheckIntervalHours`:

```json
{
  "Connector": {
    "UpdateCheckIntervalHours": 6
  }
}
```

### Disable Auto-Update

To disable auto-updates (for environments with strict change control):

```json
{
  "Connector": {
    "UpdateCheckIntervalHours": 0
  }
}
```

When auto-update is disabled, deploy updates manually using the silent upgrade command.

## Troubleshooting

### Service Status

Check if the service is running:

```powershell
Get-Service ApuraConnector
```

Expected output: `Status: Running`

### Logs

Application logs are written to:

```
C:\Program Files\Apura\Apura Connector\logs\
```

Log files rotate daily. Review the latest log for connection errors, authentication failures, or query issues.

### Windows Event Log

The connector writes events to the Windows Event Log under **Application**:

```powershell
Get-EventLog -LogName Application -Source ApuraConnector -Newest 20
```

### Common Issues

| Symptom | Cause | Resolution |
|---|---|---|
| Service fails to start | Missing or invalid API key | Set `ApiKey` in `appsettings.json` and restart |
| "Connection refused" in logs | Firewall blocking outbound 443 | Verify outbound TCP 443 is allowed to `ws.apura.xyz` |
| "Authentication failed" in logs | Invalid or expired API key | Generate a new API key in the Apura dashboard |
| SQL Server connection timeout | Network or credential issue | Verify SQL Server is reachable and credentials are correct |
| Service stops after install | Configuration error | Check logs at `C:\Program Files\Apura\Apura Connector\logs\` |
| "Certificate error" in logs | SSL inspection proxy | Install proxy root CA in machine certificate store |

### Diagnostic Commands

```powershell
# Check service status
Get-Service ApuraConnector

# View recent logs
Get-Content "C:\Program Files\Apura\Apura Connector\logs\*.log" -Tail 50

# Test outbound connectivity
Test-NetConnection -ComputerName ws.apura.xyz -Port 443

# Restart the service
Restart-Service ApuraConnector

# Check Windows Firewall rule
Get-NetFirewallRule -DisplayName "Apura Connector*"
```

## Uninstallation

### Via Control Panel

1. Open **Settings > Apps > Installed Apps** (Windows 10/11) or **Control Panel > Programs and Features** (Server).
2. Find **Apura Connector** and click **Uninstall**.

### Silent Uninstall

```powershell
msiexec /x ApuraConnector.msi /quiet /norestart
```

### What Gets Removed

- Windows Service registration
- Program files in `C:\Program Files\Apura\Apura Connector\`
- Windows Firewall outbound rule

### What Gets Preserved

- `credentials.dpapi` file (encrypted credentials) -- preserved for reinstallation
- Any custom log files
