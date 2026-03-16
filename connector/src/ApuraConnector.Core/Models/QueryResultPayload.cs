namespace ApuraConnector.Core.Models;

public class QueryResultPayload
{
    public string Status { get; set; } = "ok";
    public List<ColumnInfo> Columns { get; set; } = new();
    public int RowCount { get; set; }
    public long ExecutionMs { get; set; }
    public List<object?[]> Data { get; set; } = new();
}

public class ColumnInfo
{
    public string Name { get; set; } = "";
    public string Type { get; set; } = "";
}
