using System.Data;
using System.Diagnostics;
using Microsoft.Data.SqlClient;
using ApuraConnector.Core.Models;
using ApuraConnector.Core.Validation;
using Serilog;

namespace ApuraConnector.Infrastructure.Database;

public class QueryExecutor
{
    private readonly SqlServerConnection _connection;
    private readonly SqlValidator _validator;
    private readonly ILogger _logger;
    private readonly SemaphoreSlim _concurrencyLimiter;
    private readonly int _maxConcurrent;
    private readonly int _maxRows;

    public QueryExecutor(
        SqlServerConnection connection,
        SqlValidator validator,
        ILogger logger,
        int maxConcurrent = 5,
        int maxRows = 10000)
    {
        _connection = connection;
        _validator = validator;
        _logger = logger;
        _maxConcurrent = maxConcurrent;
        _concurrencyLimiter = new SemaphoreSlim(maxConcurrent);
        _maxRows = maxRows;
    }

    public int ActiveQueries => _maxConcurrent - _concurrencyLimiter.CurrentCount;

    public async Task<QueryResultPayload> ExecuteAsync(
        string sql,
        int timeoutSeconds = 30,
        int maxRows = 0,
        CancellationToken ct = default)
    {
        if (maxRows <= 0) maxRows = _maxRows;

        // 1. Validate SQL (Barrier 2 of 3)
        var validation = _validator.Validate(sql);
        if (!validation.IsValid)
        {
            _logger.Warning("SQL validation failed: {Reason}", validation.Reason);
            throw new InvalidOperationException($"SQL validation failed: {validation.Reason}");
        }

        // 2. Acquire concurrency slot
        if (!await _concurrencyLimiter.WaitAsync(TimeSpan.FromSeconds(10), ct))
            throw new InvalidOperationException("Too many concurrent queries");

        var sw = Stopwatch.StartNew();
        try
        {
            await using var conn = _connection.CreateConnection();
            await conn.OpenAsync(ct);

            await using var cmd = new SqlCommand(sql, conn);
            cmd.CommandTimeout = timeoutSeconds;

            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(timeoutSeconds + 5));

            await using var reader = await cmd.ExecuteReaderAsync(
                CommandBehavior.SequentialAccess | CommandBehavior.SingleResult,
                cts.Token);

            // Get column metadata
            var columns = new List<ColumnInfo>();
            for (int i = 0; i < reader.FieldCount; i++)
            {
                columns.Add(new ColumnInfo
                {
                    Name = reader.GetName(i),
                    Type = reader.GetDataTypeName(i),
                });
            }

            // Read rows
            var rows = new List<object?[]>();
            var rowCount = 0;

            while (await reader.ReadAsync(cts.Token))
            {
                var row = new object?[reader.FieldCount];
                for (int i = 0; i < reader.FieldCount; i++)
                {
                    if (reader.IsDBNull(i))
                        row[i] = null;
                    else
                    {
                        var value = reader.GetValue(i);
                        // Convert non-JSON-friendly types
                        row[i] = value switch
                        {
                            DateTime dt => dt.ToString("O"),
                            DateTimeOffset dto => dto.ToString("O"),
                            byte[] bytes => Convert.ToBase64String(bytes),
                            decimal d => d.ToString("G"),
                            _ => value,
                        };
                    }
                }

                rows.Add(row);
                rowCount++;

                if (rowCount >= maxRows)
                    break;
            }

            sw.Stop();
            _logger.Information("Query executed: {RowCount} rows in {ElapsedMs}ms", rowCount, sw.ElapsedMilliseconds);

            return new QueryResultPayload
            {
                Status = "ok",
                Columns = columns,
                RowCount = rowCount,
                ExecutionMs = sw.ElapsedMilliseconds,
                Data = rows,
            };
        }
        catch (SqlException ex)
        {
            sw.Stop();
            _logger.Error(ex, "SQL execution error after {ElapsedMs}ms", sw.ElapsedMilliseconds);
            throw;
        }
        finally
        {
            _concurrencyLimiter.Release();
        }
    }
}
