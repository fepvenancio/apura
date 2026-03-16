using Microsoft.SqlServer.TransactSql.ScriptDom;

namespace ApuraConnector.Core.Validation;

public class DangerousConstructVisitor : TSqlFragmentVisitor
{
    private static readonly HashSet<string> BlockedFunctions = new(StringComparer.OrdinalIgnoreCase)
    {
        "OPENROWSET", "OPENQUERY", "OPENDATASOURCE",
        "xp_cmdshell", "xp_regread", "xp_regwrite", "xp_fileexist", "xp_dirtree",
        "sp_executesql", "sp_execute"
    };

    public bool HasViolation { get; private set; }
    public string? ViolationReason { get; private set; }

    private void Block(string reason)
    {
        if (!HasViolation)
        {
            HasViolation = true;
            ViolationReason = reason;
        }
    }

    // Block EXEC/EXECUTE
    public override void Visit(ExecuteStatement node) => Block("EXECUTE statement not allowed");
    public override void Visit(ExecuteInsertSource node) => Block("EXECUTE as insert source not allowed");

    // Block WAITFOR (DoS vector)
    public override void Visit(WaitForStatement node) => Block("WAITFOR not allowed");

    // Block DML that might appear in CTEs
    public override void Visit(InsertStatement node) => Block("INSERT not allowed");
    public override void Visit(UpdateStatement node) => Block("UPDATE not allowed");
    public override void Visit(DeleteStatement node) => Block("DELETE not allowed");
    public override void Visit(MergeStatement node) => Block("MERGE not allowed");
    public override void Visit(TruncateTableStatement node) => Block("TRUNCATE not allowed");

    // Block DDL
    public override void Visit(CreateTableStatement node) => Block("CREATE TABLE not allowed");
    public override void Visit(AlterTableStatement node) => Block("ALTER TABLE not allowed");
    public override void Visit(DropTableStatement node) => Block("DROP TABLE not allowed");
    public override void Visit(CreateViewStatement node) => Block("CREATE VIEW not allowed");
    public override void Visit(CreateProcedureStatement node) => Block("CREATE PROCEDURE not allowed");
    public override void Visit(CreateFunctionStatement node) => Block("CREATE FUNCTION not allowed");

    // Block DCL
    public override void Visit(GrantStatement node) => Block("GRANT not allowed");
    public override void Visit(RevokeStatement node) => Block("REVOKE not allowed");
    public override void Visit(DenyStatement node) => Block("DENY not allowed");

    // Block dangerous functions
    public override void Visit(FunctionCall node)
    {
        if (BlockedFunctions.Contains(node.FunctionName.Value))
            Block($"Function {node.FunctionName.Value} not allowed");
    }

    // Block OPENROWSET etc.
    public override void Visit(OpenRowsetTableReference node) => Block("OPENROWSET not allowed");
    public override void Visit(OpenQueryTableReference node) => Block("OPENQUERY not allowed");
    // OpenDataSourceTableReference not available in ScriptDom 170.x; OPENDATASOURCE is caught via BlockedFunctions

    // Block SELECT INTO (creates tables)
    public override void Visit(SelectInsertSource node) => Block("SELECT INTO not allowed");

    // Block BULK INSERT
    public override void Visit(BulkInsertStatement node) => Block("BULK INSERT not allowed");

    // Block BACKUP/RESTORE
    public override void Visit(BackupDatabaseStatement node) => Block("BACKUP not allowed");
    // RestoreDatabaseStatement not available in ScriptDom 170.x; RESTORE is blocked at statement-type level (not a SELECT)

    // Block SHUTDOWN
    public override void Visit(ShutdownStatement node) => Block("SHUTDOWN not allowed");

    // Block DBCC
    public override void Visit(DbccStatement node) => Block("DBCC not allowed");

    // Block DECLARE (variable declarations)
    public override void Visit(DeclareVariableStatement node) => Block("DECLARE not allowed");

    // Block SET (variable assignments)
    public override void Visit(SetVariableStatement node) => Block("SET variable not allowed");
}
