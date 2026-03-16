using Microsoft.SqlServer.TransactSql.ScriptDom;

namespace ApuraConnector.Core.Validation;

public class SqlValidationResult
{
    public bool IsValid { get; set; }
    public string? Reason { get; set; }
    public static SqlValidationResult Ok() => new() { IsValid = true };
    public static SqlValidationResult Reject(string reason) => new() { IsValid = false, Reason = reason };
}

public class SqlValidator
{
    private static readonly TSql160Parser Parser = new(initialQuotedIdentifiers: true);

    public SqlValidationResult Validate(string sql)
    {
        // 1. Basic checks
        if (string.IsNullOrWhiteSpace(sql))
            return SqlValidationResult.Reject("Empty query");
        if (sql.Length > 4000)
            return SqlValidationResult.Reject("Query exceeds 4000 character limit");
        // SECURITY NOTE: Semicolons are rejected even inside string literals.
        // This is intentional — it prevents batch injection at the cost of
        // rejecting rare legitimate queries with semicolons in data values.
        // The TSql.ScriptDom batch check (line 37) is the authoritative control.
        if (sql.Contains(';'))
            return SqlValidationResult.Reject("Semicolons not allowed (no batch queries)");

        // 2. Parse with TSql.ScriptDom
        using var reader = new StringReader(sql);
        var fragment = Parser.Parse(reader, out IList<ParseError> errors);

        if (errors.Count > 0)
            return SqlValidationResult.Reject($"SQL parse error: {errors[0].Message}");

        if (fragment is not TSqlScript script)
            return SqlValidationResult.Reject("Invalid SQL structure");

        if (script.Batches.Count != 1)
            return SqlValidationResult.Reject("Exactly one batch required");

        var batch = script.Batches[0];
        if (batch.Statements.Count != 1)
            return SqlValidationResult.Reject("Exactly one statement required");

        var statement = batch.Statements[0];

        // 3. Whitelist: only SELECT statements
        if (statement is not SelectStatement)
            return SqlValidationResult.Reject($"Only SELECT statements allowed. Detected: {statement.GetType().Name}");

        // 4. Walk AST for dangerous constructs
        var visitor = new DangerousConstructVisitor();
        fragment.Accept(visitor);

        if (visitor.HasViolation)
            return SqlValidationResult.Reject($"Blocked: {visitor.ViolationReason}");

        return SqlValidationResult.Ok();
    }
}
