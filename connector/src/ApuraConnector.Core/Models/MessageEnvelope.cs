namespace ApuraConnector.Core.Models;

public class MessageEnvelope
{
    public int V { get; set; } = 1;
    public string Id { get; set; } = "";
    public string Type { get; set; } = "";
    public string Ts { get; set; } = "";
    public object? Payload { get; set; }
}
