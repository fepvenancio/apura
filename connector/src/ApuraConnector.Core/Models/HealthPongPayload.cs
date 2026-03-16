namespace ApuraConnector.Core.Models;

public class HealthPongPayload
{
    public long UptimeSeconds { get; set; }
    public bool SqlServerConnected { get; set; }
    public int ActiveQueries { get; set; }
    public long MemoryMb { get; set; }
    public string Version { get; set; } = "";
}
