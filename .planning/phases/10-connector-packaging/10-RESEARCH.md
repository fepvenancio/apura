# Phase 10: Connector Packaging - Research

**Researched:** 2026-03-19
**Domain:** .NET Windows Service MSI packaging, DPAPI credential storage, auto-update
**Confidence:** HIGH

## Summary

Phase 10 packages the existing .NET 8 connector as a production-ready MSI installer with Windows Service registration, DPAPI-based credential storage, auto-update capability, and end-to-end validation. The connector codebase is already well-structured: it uses `Microsoft.NET.Sdk.Worker` with `Host.CreateApplicationBuilder`, `BackgroundService` (ConnectorWorker), and proper DI. An empty `ApuraConnector.Setup` project already exists in the solution but contains only a placeholder `Console.WriteLine`.

The primary challenge is WiX v6 MSI creation with self-contained .NET 8 publish, since the connector must bundle the .NET runtime to avoid requiring customers to install it separately. DPAPI integration is straightforward using the `System.Security.Cryptography.ProtectedData` NuGet package. Auto-update requires a separate updater process pattern because a running Windows Service cannot replace its own executable.

**Primary recommendation:** Use WiX Toolset v6 SDK (`WixToolset.Sdk`) integrated into MSBuild, publish self-contained for `win-x64`, and implement a lightweight updater service that downloads and runs `msiexec /i` for major upgrades.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CONN-01 | MSI installer packages connector with .NET runtime, registers Windows Service, configures firewall | WiX v6 `ServiceInstall`/`ServiceControl` elements + self-contained publish + WiX Firewall extension |
| CONN-02 | Silent install support for enterprise GPO deployment (msiexec /quiet) | MSI natively supports `/quiet` and `/passive` flags; WiX `MajorUpgrade` element handles upgrade scenarios |
| CONN-03 | DPAPI-based credential storage for SQL Server connection strings | `System.Security.Cryptography.ProtectedData` with `DataProtectionScope.LocalMachine` scope |
| CONN-04 | Auto-update mechanism checks version endpoint and triggers MSI upgrade | Version check endpoint on API + separate updater process + `msiexec /i /quiet` for silent upgrade |
| CONN-05 | Connector validated working end-to-end on Windows with Primavera database | Requires Windows test environment with SQL Server; unit tests for DPAPI/config; integration tests for WebSocket tunnel |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| WixToolset.Sdk | 6.0.2 | MSI installer creation via MSBuild | Industry standard for MSI, .NET SDK integration, Microsoft-recommended |
| WixToolset.Firewall.wixext | 6.0.x | Firewall rule configuration in MSI | Official WiX extension for Windows Firewall exceptions |
| System.Security.Cryptography.ProtectedData | 9.0.4 | DPAPI credential encryption | Official .NET package for Windows DPAPI; machine-scope encryption |
| Microsoft.Extensions.Hosting | 8.0.1 | Windows Service host (already in use) | Already used; provides BackgroundService + UseWindowsService |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| System.ServiceProcess.ServiceController | 9.0.4 | Programmatic service control for updater | Auto-update: stop/start service during upgrade |
| xunit | 2.4.2 | Unit testing (already in use) | Test DPAPI wrapper, config validation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| WiX 6 | NSIS | Script-based, no MSBuild integration, not MSI format (GPO requires MSI) |
| WiX 6 | Inno Setup | Produces EXE not MSI; enterprise IT requires MSI for GPO deployment |
| WiX 6 | MSIX | Modern but limited Windows Service support; less enterprise GPO tooling |
| Custom updater | Squirrel.Windows | Heavy framework; Squirrel is semi-maintained; simple MSI upgrade is sufficient |

**Installation (NuGet):**
```bash
# In ApuraConnector.Infrastructure project
dotnet add package System.Security.Cryptography.ProtectedData

# In ApuraConnector.Service project (for service control during updates)
dotnet add package System.ServiceProcess.ServiceController

# WiX SDK is referenced in .wixproj, not via dotnet add
```

## Architecture Patterns

### Recommended Project Structure
```
connector/
├── ApuraConnector.sln
├── src/
│   ├── ApuraConnector.Core/           # Models, validation (unchanged)
│   ├── ApuraConnector.Infrastructure/  # DB, tunnel, certificates
│   │   ├── Credentials/
│   │   │   └── DpapiCredentialStore.cs # NEW: DPAPI wrapper
│   │   └── Updates/
│   │       └── UpdateChecker.cs        # NEW: Version check logic
│   ├── ApuraConnector.Service/         # Windows Service host
│   │   ├── Program.cs                  # Entry point (add UseWindowsService)
│   │   ├── ConnectorWorker.cs          # BackgroundService (unchanged)
│   │   └── UpdateWorker.cs             # NEW: Background update checker
│   └── ApuraConnector.Installer/       # NEW: WiX installer project
│       ├── ApuraConnector.Installer.wixproj
│       ├── Package.wxs                 # Main installer definition
│       └── Dialogs.wxs                 # Optional: custom UI dialogs
├── test/
│   └── ApuraConnector.Core.Tests/      # Existing + new DPAPI tests
└── docs/
    └── INSTALLATION.md                 # NEW: Installation guide
```

### Pattern 1: Self-Contained Publish + WiX MSI
**What:** Publish .NET 8 as self-contained single-directory output, then package into MSI via WiX.
**When to use:** Always -- connector must run on machines without .NET runtime pre-installed.
**Example:**

```xml
<!-- ApuraConnector.Service.csproj additions -->
<PropertyGroup>
  <RuntimeIdentifier>win-x64</RuntimeIdentifier>
  <SelfContained>true</SelfContained>
  <PublishSingleFile>false</PublishSingleFile>  <!-- WiX needs individual files -->
  <IncludeNativeLibrariesForSelfExtract>false</IncludeNativeLibrariesForSelfExtract>
</PropertyGroup>
```

```xml
<!-- ApuraConnector.Installer.wixproj -->
<Project Sdk="WixToolset.Sdk/6.0.2">
  <ItemGroup>
    <ProjectReference Include="..\ApuraConnector.Service\ApuraConnector.Service.csproj"
                      Publish="true" />
  </ItemGroup>
  <ItemGroup>
    <PackageReference Include="WixToolset.Firewall.wixext" Version="6.0.*" />
  </ItemGroup>
</Project>
```

### Pattern 2: WiX Package.wxs for Windows Service
**What:** Declarative MSI definition with ServiceInstall/ServiceControl elements.
**When to use:** Core installer definition.
**Example:**

```xml
<!-- Source: Microsoft Learn - Windows Service installer tutorial -->
<?xml version="1.0" encoding="UTF-8"?>
<?define Name = "Apura Connector" ?>
<?define Manufacturer = "Apura" ?>
<?define Version = "1.0.0.0" ?>
<?define UpgradeCode = "GENERATE-A-REAL-GUID-HERE" ?>

<Wix xmlns="http://wixtoolset.org/schemas/v4/wxs"
     xmlns:fw="http://wixtoolset.org/schemas/v4/wxs/firewall">
  <Package Name="$(Name)"
           Manufacturer="$(Manufacturer)"
           Version="$(Version)"
           UpgradeCode="$(var.UpgradeCode)"
           Compressed="true">

    <MajorUpgrade DowngradeErrorMessage=
      "A newer version of [ProductName] is already installed." />

    <StandardDirectory Id="ProgramFiles6432Folder">
      <Directory Id="ROOTDIRECTORY" Name="$(var.Manufacturer)">
        <Directory Id="INSTALLFOLDER" Name="$(Name)" />
      </Directory>
    </StandardDirectory>

    <DirectoryRef Id="INSTALLFOLDER">
      <Component Id="ServiceExecutable" Bitness="always64">
        <File Id="ApuraConnector.Service.exe"
              Source="$(var.ApuraConnector.Service.TargetDir)publish\ApuraConnector.Service.exe"
              KeyPath="true" />
        <RemoveFile Id="ALLFILES" Name="*.*" On="both" />

        <ServiceInstall Id="ApuraConnectorService"
                        Type="ownProcess"
                        Name="ApuraConnector"
                        DisplayName="$(Name)"
                        Description="Apura on-premise database connector"
                        Start="auto"
                        Account="LocalService"
                        ErrorControl="normal" />

        <ServiceControl Id="StartApuraConnector"
                        Start="install"
                        Stop="both"
                        Remove="uninstall"
                        Name="ApuraConnector"
                        Wait="true" />

        <!-- Outbound HTTPS firewall rule -->
        <fw:FirewallException Id="ApuraOutbound443"
                              Name="Apura Connector (Outbound HTTPS)"
                              Protocol="tcp"
                              Port="443"
                              Direction="out"
                              Profile="all"
                              Scope="any" />
      </Component>
    </DirectoryRef>

    <Feature Id="Service" Title="Apura Connector" Level="1">
      <ComponentRef Id="ServiceExecutable" />
    </Feature>
  </Package>
</Wix>
```

### Pattern 3: DPAPI Credential Storage
**What:** Encrypt SQL Server credentials using Windows DPAPI with machine scope.
**When to use:** Storing connection strings at rest; the service runs as LocalService.
**Example:**

```csharp
// Source: Microsoft Learn - How to use Data Protection
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

public class DpapiCredentialStore
{
    private readonly string _credentialFilePath;
    // Fixed entropy for this application (not secret, just prevents
    // accidental cross-app decryption)
    private static readonly byte[] Entropy =
        Encoding.UTF8.GetBytes("ApuraConnector.Credentials.v1");

    public DpapiCredentialStore(string credentialFilePath)
    {
        _credentialFilePath = credentialFilePath;
    }

    public void SaveCredentials(SqlServerConfig config)
    {
        var json = JsonSerializer.Serialize(config);
        var plaintext = Encoding.UTF8.GetBytes(json);
        var encrypted = ProtectedData.Protect(
            plaintext, Entropy, DataProtectionScope.LocalMachine);
        File.WriteAllBytes(_credentialFilePath, encrypted);
    }

    public SqlServerConfig LoadCredentials()
    {
        var encrypted = File.ReadAllBytes(_credentialFilePath);
        var plaintext = ProtectedData.Unprotect(
            encrypted, Entropy, DataProtectionScope.LocalMachine);
        var json = Encoding.UTF8.GetString(plaintext);
        return JsonSerializer.Deserialize<SqlServerConfig>(json)
            ?? throw new InvalidOperationException("Failed to deserialize credentials");
    }
}
```

### Pattern 4: Auto-Update via Version Check + MSI Upgrade
**What:** Background service checks version endpoint, downloads new MSI, triggers upgrade.
**When to use:** Periodic update checks (e.g., every 6 hours).
**Example:**

```csharp
public class UpdateChecker
{
    private readonly HttpClient _httpClient;
    private readonly string _versionEndpoint;
    private readonly string _currentVersion;

    public async Task<UpdateInfo?> CheckForUpdateAsync(CancellationToken ct)
    {
        var response = await _httpClient.GetAsync(_versionEndpoint, ct);
        response.EnsureSuccessStatusCode();
        var info = await response.Content
            .ReadFromJsonAsync<UpdateInfo>(ct);

        if (info != null && Version.Parse(info.LatestVersion)
            > Version.Parse(_currentVersion))
        {
            return info;
        }
        return null;
    }

    public async Task DownloadAndApplyUpdateAsync(
        UpdateInfo info, CancellationToken ct)
    {
        // Download MSI to temp directory
        var tempMsi = Path.Combine(
            Path.GetTempPath(), $"ApuraConnector-{info.LatestVersion}.msi");
        using var stream = await _httpClient.GetStreamAsync(
            info.DownloadUrl, ct);
        using var file = File.Create(tempMsi);
        await stream.CopyToAsync(file, ct);

        // Trigger MSI upgrade (will stop and restart the service)
        var process = Process.Start(new ProcessStartInfo
        {
            FileName = "msiexec",
            Arguments = $"/i \"{tempMsi}\" /quiet /norestart /l*v \"{tempMsi}.log\"",
            UseShellExecute = true,
            Verb = "runas"
        });
        // Service will be stopped by MSI ServiceControl element,
        // then restarted after upgrade completes
    }
}

public record UpdateInfo(
    string LatestVersion,
    string DownloadUrl,
    string? ReleaseNotes,
    string? Checksum);
```

### Pattern 5: UseWindowsService Integration
**What:** Add `UseWindowsService()` to the host builder for proper SCM integration.
**When to use:** Required for the service to respond to SCM start/stop/pause commands.
**Example:**

```csharp
// In Program.cs - add this to builder
var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddWindowsService(options =>
{
    options.ServiceName = "ApuraConnector";
});
```

This requires adding `Microsoft.Extensions.Hosting.WindowsServices` NuGet package:
```bash
dotnet add package Microsoft.Extensions.Hosting.WindowsServices
```

### Anti-Patterns to Avoid
- **PublishSingleFile with WiX:** WiX needs to enumerate individual files for the MSI component model. Single-file publish is incompatible.
- **LocalSystem account for service:** Overprivileged. Use `LocalService` or `NetworkService`. The connector only needs outbound HTTPS.
- **Storing DPAPI entropy as a secret:** Entropy is not a key -- it prevents cross-app decryption. Hardcode it as a constant. The actual encryption key is the machine's DPAPI master key.
- **In-process self-update:** A running service cannot replace its own DLLs. Must use `msiexec` which stops the service via ServiceControl, replaces files, then restarts.
- **Storing credentials in appsettings.json in plaintext:** Current approach stores SQL password in plaintext JSON. DPAPI must replace this.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MSI creation | Custom installer scripts | WiX Toolset v6 SDK | MSI format required for GPO; WiX handles service lifecycle, upgrades, rollback |
| Credential encryption | Custom AES encryption with file-stored keys | DPAPI via ProtectedData | OS-managed key material; no key storage problem; standard Windows practice |
| Windows Service registration | Manual `sc.exe create` calls | WiX ServiceInstall element | Declarative, handles install/uninstall/upgrade transitions correctly |
| Firewall rules | PowerShell scripts in custom actions | WiX Firewall extension | Declarative, properly rolls back on uninstall |
| .NET runtime bundling | Separate .NET installer download | Self-contained publish | Single MSI, no prerequisites, no version conflicts |

**Key insight:** WiX's declarative model handles the hardest parts of Windows installer development -- service lifecycle during upgrades, rollback on failure, and component reference counting. Custom scripting in MSI custom actions is the #1 source of installer bugs.

## Common Pitfalls

### Pitfall 1: Service Account Cannot Decrypt DPAPI Data
**What goes wrong:** Credentials encrypted during interactive setup (as the installing user) cannot be decrypted by the Windows Service running as `LocalService`.
**Why it happens:** `DataProtectionScope.CurrentUser` ties encryption to the user profile. `LocalService` has a different profile.
**How to avoid:** Always use `DataProtectionScope.LocalMachine` for service credentials. Any account on the machine can decrypt, but the data is tied to that specific machine (cannot be copied to another server).
**Warning signs:** `CryptographicException: The data is invalid` when the service starts.

### Pitfall 2: WiX MajorUpgrade Must Be First in Package
**What goes wrong:** Upgrade installs a second copy instead of replacing the existing installation.
**Why it happens:** `MajorUpgrade` element must appear before any `Feature` elements. The `UpgradeCode` GUID must remain constant across all versions -- changing it creates a separate product.
**How to avoid:** Set `UpgradeCode` once and never change it. Keep `MajorUpgrade` as the first child of `Package`. Use semantic versioning for `Version`.
**Warning signs:** Two entries in Add/Remove Programs after upgrade.

### Pitfall 3: Self-Contained Publish Produces 200+ Files
**What goes wrong:** WiX needs a `Component` and `File` element for every file in the publish output. Manually listing 200+ DLLs in Package.wxs is unmaintainable.
**Why it happens:** Self-contained .NET publish includes the entire runtime.
**How to avoid:** Use WiX `HeatDirectory` or the `Publish="true"` attribute on `ProjectReference` in the .wixproj which auto-harvests published files. Alternatively, use the `wix.exe heat` command to generate component groups from a directory.
**Warning signs:** Package.wxs has hundreds of manually maintained File elements.

### Pitfall 4: Service Stop Timeout During Upgrade
**What goes wrong:** MSI upgrade times out waiting for the service to stop because the WebSocket reconnect loop keeps running.
**Why it happens:** `ServiceControl Stop="both"` sends a stop signal, but the service has a reconnection loop with up to 120-second backoff. Default MSI timeout is 30 seconds.
**How to avoid:** Ensure `StopAsync` in ConnectorWorker properly cancels the tunnel's CancellationToken and awaits `DisconnectAsync` with a reasonable timeout. The existing `StopAsync` already calls `DisconnectAsync()` -- verify the WebSocket close completes within 10 seconds.
**Warning signs:** MSI installation hangs at "Stopping services" step.

### Pitfall 5: Auto-Update Requires Admin Privileges
**What goes wrong:** The service runs as `LocalService` which cannot run `msiexec /i` to install updates (requires admin/elevated privileges).
**Why it happens:** MSI installation modifies Program Files and service registrations, which require elevation.
**How to avoid:** Two approaches: (1) Download MSI and schedule a task via Task Scheduler that runs elevated, or (2) Use a separate lightweight updater Windows Service running as `LocalSystem` specifically for applying updates. Option 1 is simpler. Option 2 is more robust but adds complexity.
**Warning signs:** Update downloaded but never applies; `Access denied` in update logs.

### Pitfall 6: Firewall Rule Persists After Uninstall
**What goes wrong:** If firewall rules are created via custom actions (PowerShell) instead of the WiX Firewall extension, they persist after uninstallation.
**Why it happens:** Custom actions don't participate in MSI's rollback/uninstall tracking.
**How to avoid:** Use the WiX Firewall extension (`fw:FirewallException`), which automatically removes rules on uninstall.
**Warning signs:** Orphaned firewall rules after product removal.

## Code Examples

### Modifying Program.cs for Windows Service Support
```csharp
// Source: Current Program.cs + Microsoft Learn Windows Service docs
// Add UseWindowsService() to support SCM integration
var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddWindowsService(options =>
{
    options.ServiceName = "ApuraConnector";
});
builder.Services.AddSerilog();

// Load config -- prefer DPAPI-stored credentials over appsettings.json
var connectorConfig = builder.Configuration
    .GetSection("Connector")
    .Get<ConnectorConfig>() ?? new ConnectorConfig();

var credStorePath = Path.Combine(
    AppContext.BaseDirectory, "credentials.dpapi");
SqlServerConfig sqlConfig;
if (File.Exists(credStorePath))
{
    var credStore = new DpapiCredentialStore(credStorePath);
    sqlConfig = credStore.LoadCredentials();
}
else
{
    sqlConfig = builder.Configuration
        .GetSection("SqlServer")
        .Get<SqlServerConfig>() ?? new SqlServerConfig();
}
```

### Version Check Endpoint (API-side, new route)
```typescript
// packages/api-gateway/src/routes/connector.ts
// New endpoint for connector update checks
app.get('/api/connector/version', async (c) => {
  return c.json({
    latestVersion: '1.0.0',
    downloadUrl: 'https://releases.apura.xyz/connector/ApuraConnector-1.0.0.msi',
    releaseNotes: 'Initial release',
    minVersion: '0.1.0', // Force update below this version
  });
});
```

### Silent Install Command (for GPO documentation)
```powershell
# Standard silent install
msiexec /i ApuraConnector.msi /quiet /norestart /l*v install.log

# With properties for pre-configured deployment
msiexec /i ApuraConnector.msi /quiet /norestart ^
  APIKEY="your-api-key" ^
  SQLSERVER="server\instance" ^
  SQLDB="PRIFIXUS" ^
  SQLAUTH="windows"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| WiX v3 (XML-heavy, separate toolchain) | WiX v6 (MSBuild SDK, simplified schema) | 2024 | Simpler .wixproj, NuGet integration, no standalone install |
| .NET Framework Windows Services (ServiceBase) | .NET 8 BackgroundService + UseWindowsService | 2020+ | Already using this pattern; just need the NuGet package |
| Squirrel.Windows for updates | Simple MSI major upgrade | - | Squirrel semi-maintained; MSI upgrades are reliable and well-understood |
| NSIS/Inno Setup EXE installers | WiX MSI for enterprise GPO | - | Enterprise IT mandates MSI format for GPO/SCCM deployment |

**Deprecated/outdated:**
- `System.Security.Cryptography.ProtectedMemory`: Only for in-memory encryption, not file storage. Use `ProtectedData` instead.
- WiX v3 `candle.exe` / `light.exe` CLI: Replaced by `wix.exe` in v4+ and MSBuild SDK in v6.
- `sc.exe create` for service registration: Use WiX `ServiceInstall` for installer-managed services.

## Open Questions

1. **WiX v6 file harvesting for self-contained publish**
   - What we know: WiX supports `Publish="true"` on ProjectReference to auto-harvest. Microsoft's tutorial shows this working with WiX v4 SDK.
   - What's unclear: Exact syntax differences between v4 and v6 for file harvesting. The `heat` command may or may not exist in v6.
   - Recommendation: Start with `Publish="true"` approach. If it doesn't auto-harvest all files, fall back to WiX `HeatDirectory` or manual directory harvesting.

2. **MSI property passing for silent install configuration**
   - What we know: MSI supports custom properties via command line (`msiexec /i ... PROP=VALUE`).
   - What's unclear: How to wire WiX custom properties to write appsettings.json or invoke the DPAPI credential store during silent install.
   - Recommendation: Use WiX custom actions (deferred, impersonated) to write initial config. Keep it simple: write appsettings.json with non-sensitive config, store credentials via DPAPI in a post-install step.

3. **Update mechanism elevation strategy**
   - What we know: `LocalService` cannot run `msiexec /i`. Updates need elevation.
   - What's unclear: Best pattern for a service to trigger its own upgrade without a separate updater service.
   - Recommendation: Use Windows Task Scheduler -- create a one-time elevated task that runs `msiexec /i` with the downloaded MSI. The main service can use `TaskScheduler` COM interop or simply shell out to `schtasks.exe`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | xunit 2.4.2 (already configured) |
| Config file | `connector/test/ApuraConnector.Core.Tests/ApuraConnector.Core.Tests.csproj` |
| Quick run command | `dotnet test connector/test/ApuraConnector.Core.Tests/ --no-build -v q` |
| Full suite command | `dotnet test connector/ --no-build -v q` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONN-01 | MSI builds successfully with all components | build verification | `dotnet build connector/src/ApuraConnector.Installer/ -c Release` | No -- Wave 0 |
| CONN-02 | Silent install flags work (MSI properties accepted) | manual + smoke | Manual: `msiexec /i ... /quiet` on Windows VM | No -- manual |
| CONN-03 | DPAPI encrypt/decrypt round-trip | unit | `dotnet test --filter "DpapiCredentialStore"` | No -- Wave 0 |
| CONN-03 | DPAPI fails gracefully on non-Windows | unit | `dotnet test --filter "DpapiPlatformCheck"` | No -- Wave 0 |
| CONN-04 | Version check parses response correctly | unit | `dotnet test --filter "UpdateChecker"` | No -- Wave 0 |
| CONN-04 | Update triggers MSI download | unit (mocked HTTP) | `dotnet test --filter "UpdateDownload"` | No -- Wave 0 |
| CONN-05 | Connector connects via WebSocket and executes query | integration/e2e | Manual: requires Windows + SQL Server + running cloud | No -- manual |

### Sampling Rate
- **Per task commit:** `dotnet test connector/test/ApuraConnector.Core.Tests/ --no-build -v q`
- **Per wave merge:** `dotnet test connector/ --no-build -v q`
- **Phase gate:** Full suite green + successful MSI build + manual Windows install test

### Wave 0 Gaps
- [ ] `connector/test/ApuraConnector.Core.Tests/DpapiCredentialStoreTests.cs` -- covers CONN-03
- [ ] `connector/test/ApuraConnector.Core.Tests/UpdateCheckerTests.cs` -- covers CONN-04
- [ ] `connector/src/ApuraConnector.Installer/ApuraConnector.Installer.wixproj` -- WiX project setup for CONN-01
- [ ] Framework: `dotnet add package Microsoft.Extensions.Hosting.WindowsServices` -- for UseWindowsService

## Sources

### Primary (HIGH confidence)
- [Microsoft Learn - Create a Windows Service installer](https://learn.microsoft.com/en-us/dotnet/core/extensions/windows-service-with-installer) -- Complete tutorial with WiX and service registration patterns
- [Microsoft Learn - How to use Data Protection (DPAPI)](https://learn.microsoft.com/en-us/dotnet/standard/security/how-to-use-data-protection) -- ProtectedData API usage with code examples
- [Microsoft Learn - ProtectedData Class](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.protecteddata) -- API reference for DataProtectionScope
- [NuGet - WixToolset.Sdk 6.0.2](https://www.nuget.org/packages/WixToolset.Sdk) -- Current version verified
- [NuGet - System.Security.Cryptography.ProtectedData](https://www.nuget.org/packages/system.security.cryptography.protecteddata/) -- Package availability

### Secondary (MEDIUM confidence)
- [WiX Toolset official site](https://wixtoolset.org/) -- General WiX documentation
- [FireGiant WiX docs - ServiceControl element](https://docs.firegiant.com/wix/schema/wxs/servicecontrol/) -- ServiceControl attribute reference
- [CMart Coding - Windows Service with WiX](https://cmartcoding.com/creating-a-windows-service-and-installer-using-net-and-wix/) -- Practical WiX + .NET tutorial
- [Omaha Consulting - Update Windows Service](https://omaha-consulting.com/update-windows-service/) -- Update patterns for Windows Services
- [WiX GitHub Discussion - Self-contained .NET](https://github.com/orgs/wixtoolset/discussions/7403) -- Community discussion on self-contained publish

### Tertiary (LOW confidence)
- WiX Firewall extension for v6 -- syntax inferred from v3 docs; v6 schema may differ slightly (needs validation during implementation)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- WiX v6 SDK and DPAPI are well-documented Microsoft-ecosystem tools
- Architecture: HIGH -- Existing connector architecture is clean; changes are additive
- Pitfalls: HIGH -- Well-known Windows Service installer pitfalls documented across multiple sources
- Auto-update: MEDIUM -- Elevation strategy needs validation; multiple viable approaches
- E2E testing: MEDIUM -- Requires Windows environment; cannot fully automate on macOS dev machine

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable domain; WiX/DPAPI don't change frequently)
