namespace ApuraConnector.Core.Models;

public class QueryExecutePayload
{
    public string Sql { get; set; } = "";
    public int TimeoutSeconds { get; set; } = 30;
    public int MaxRows { get; set; } = 10000;
}
