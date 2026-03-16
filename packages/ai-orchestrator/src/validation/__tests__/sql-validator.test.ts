import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { validateSql, SqlValidatorOptions } from '../sql-validator';
import { sanitizeSql } from '../sql-sanitizer';
import { TableAllowlist } from '../table-allowlist';

// ─── Helpers ─────────────────────────────────────────────────────────

function expectValid(sql: string, opts?: SqlValidatorOptions) {
  const result = validateSql(sql, opts);
  assert.equal(result.valid, true, `Expected VALID but got rejected: "${result.reason}" for SQL: ${sql.substring(0, 120)}`);
  return result;
}

function expectRejected(sql: string, opts?: SqlValidatorOptions) {
  const result = validateSql(sql, opts);
  assert.equal(result.valid, false, `Expected REJECTED but got valid for SQL: ${sql.substring(0, 120)}`);
  return result;
}

// =====================================================================
// MUST PASS — Valid read-only queries
// =====================================================================

describe('Valid SELECT queries', () => {
  it('01 — simple SELECT', () => {
    expectValid('SELECT Nome, Email FROM Clientes');
  });

  it('02 — SELECT with WHERE', () => {
    expectValid("SELECT Nome FROM Clientes WHERE Cidade = 'Lisboa'");
  });

  it('03 — SELECT with JOIN', () => {
    expectValid(
      'SELECT c.Nome, d.NumDoc FROM Clientes c INNER JOIN CabecDoc d ON c.Cliente = d.Entidade'
    );
  });

  it('04 — SELECT with LEFT JOIN', () => {
    expectValid(
      'SELECT c.Nome, d.NumDoc FROM Clientes c LEFT JOIN CabecDoc d ON c.Cliente = d.Entidade'
    );
  });

  it('05 — SELECT with multiple JOINs', () => {
    expectValid(
      `SELECT c.Nome, l.Artigo, l.Quantidade
       FROM Clientes c
       INNER JOIN CabecDoc d ON c.Cliente = d.Entidade
       INNER JOIN LinhasDoc l ON d.Id = l.IdCabecDoc`
    );
  });

  it('06 — SELECT with GROUP BY and HAVING', () => {
    expectValid(
      `SELECT Entidade, COUNT(*) AS Total
       FROM CabecDoc
       GROUP BY Entidade
       HAVING COUNT(*) > 5`
    );
  });

  it('07 — SELECT with ORDER BY', () => {
    expectValid(
      'SELECT Nome, Email FROM Clientes ORDER BY Nome ASC'
    );
  });

  it('08 — SELECT with TOP', () => {
    expectValid('SELECT TOP 10 Nome FROM Clientes');
  });

  it('09 — SELECT with subquery in WHERE', () => {
    expectValid(
      `SELECT Nome FROM Clientes
       WHERE Cliente IN (SELECT Entidade FROM CabecDoc WHERE TotalDocumento > 1000)`
    );
  });

  it('10 — CTE (WITH ... AS ... SELECT)', () => {
    expectValid(
      `WITH TopClientes AS (
         SELECT Entidade, SUM(TotalDocumento) AS Total
         FROM CabecDoc
         GROUP BY Entidade
       )
       SELECT c.Nome, t.Total
       FROM TopClientes t
       INNER JOIN Clientes c ON t.Entidade = c.Cliente`
    );
  });

  it('11 — UNION', () => {
    expectValid(
      `SELECT Nome, 'Cliente' AS Tipo FROM Clientes
       UNION
       SELECT Nome, 'Fornecedor' AS Tipo FROM Fornecedores`
    );
  });

  it('12 — UNION ALL', () => {
    expectValid(
      `SELECT Nome FROM Clientes
       UNION ALL
       SELECT Nome FROM Fornecedores`
    );
  });

  it('13 — COUNT aggregate', () => {
    expectValid('SELECT COUNT(*) AS Total FROM Clientes');
  });

  it('14 — SUM, AVG, MIN, MAX aggregates', () => {
    expectValid(
      `SELECT
         SUM(TotalDocumento) AS Soma,
         AVG(TotalDocumento) AS Media,
         MIN(TotalDocumento) AS Minimo,
         MAX(TotalDocumento) AS Maximo
       FROM CabecDoc`
    );
  });

  it('15 — COALESCE and ISNULL', () => {
    expectValid(
      `SELECT COALESCE(Email, 'sem@email.com') AS Email,
              ISNULL(Telefone, 'N/A') AS Telefone
       FROM Clientes`
    );
  });

  it('16 — CAST and CONVERT', () => {
    expectValid(
      `SELECT CAST(TotalDocumento AS DECIMAL(18,2)) AS Total,
              CONVERT(VARCHAR(10), DataDoc, 120) AS Data
       FROM CabecDoc`
    );
  });

  it('17 — SELECT with aliased columns', () => {
    expectValid(
      "SELECT Nome AS CustomerName, Cidade AS City FROM Clientes"
    );
  });

  it('18 — SELECT with BETWEEN', () => {
    expectValid(
      "SELECT NumDoc, TotalDocumento FROM CabecDoc WHERE TotalDocumento BETWEEN 100 AND 5000"
    );
  });

  it('19 — SELECT with LIKE', () => {
    expectValid(
      "SELECT Nome FROM Clientes WHERE Nome LIKE 'A%'"
    );
  });

  it('20 — SELECT with IS NULL / IS NOT NULL', () => {
    expectValid(
      'SELECT Nome FROM Clientes WHERE Email IS NOT NULL'
    );
  });

  it('21 — SELECT with CASE WHEN', () => {
    expectValid(
      `SELECT Nome,
              CASE WHEN Cidade = 'Lisboa' THEN 'Capital'
                   ELSE 'Other'
              END AS Regiao
       FROM Clientes`
    );
  });

  it('22 — SELECT with EXISTS subquery', () => {
    expectValid(
      `SELECT Nome FROM Clientes c
       WHERE EXISTS (SELECT 1 FROM CabecDoc d WHERE d.Entidade = c.Cliente)`
    );
  });

  it('23 — SELECT with DISTINCT', () => {
    expectValid('SELECT DISTINCT Cidade FROM Clientes');
  });

  it('24 — SELECT with table alias', () => {
    expectValid('SELECT c.Nome FROM Clientes c');
  });

  it('25 — SELECT * (allowed for AI)', () => {
    expectValid('SELECT * FROM Clientes');
  });

  it('26 — Complex real Primavera query — sales by customer', () => {
    expectValid(
      `SELECT c.Nome, SUM(d.TotalDocumento) AS TotalVendas
       FROM Clientes c
       INNER JOIN CabecDoc d ON c.Cliente = d.Entidade
       WHERE d.TipoDoc = 'FA'
       GROUP BY c.Nome
       ORDER BY TotalVendas DESC`
    );
  });

  it('27 — Complex real Primavera query — top products', () => {
    expectValid(
      `SELECT TOP 20 a.Descricao, SUM(l.Quantidade) AS QtdTotal, SUM(l.Quantidade * l.PrecUnit) AS ValorTotal
       FROM LinhasDoc l
       INNER JOIN Artigo a ON l.Artigo = a.Artigo
       INNER JOIN CabecDoc d ON l.IdCabecDoc = d.Id
       WHERE d.TipoDoc = 'FA'
       GROUP BY a.Descricao
       ORDER BY ValorTotal DESC`
    );
  });

  it('28 — Nested subquery (depth 2)', () => {
    expectValid(
      `SELECT Nome FROM Clientes
       WHERE Cliente IN (
         SELECT Entidade FROM CabecDoc
         WHERE Id IN (
           SELECT IdCabecDoc FROM LinhasDoc WHERE Quantidade > 100
         )
       )`
    );
  });

  it('29 — SELECT with multiple conditions (AND/OR)', () => {
    expectValid(
      "SELECT Nome FROM Clientes WHERE Cidade = 'Lisboa' AND (Email IS NOT NULL OR Telefone IS NOT NULL)"
    );
  });
});

// =====================================================================
// MUST REJECT — Dangerous / mutating queries
// =====================================================================

describe('Dangerous queries — must reject', () => {
  it('30 — INSERT INTO', () => {
    expectRejected("INSERT INTO Clientes (Nome) VALUES ('Hacker')");
  });

  it('31 — UPDATE SET', () => {
    expectRejected("UPDATE Clientes SET Nome = 'Hacked' WHERE Cliente = 1");
  });

  it('32 — DELETE FROM', () => {
    expectRejected('DELETE FROM Clientes WHERE Cliente = 1');
  });

  it('33 — DROP TABLE', () => {
    expectRejected('DROP TABLE Clientes');
  });

  it('34 — ALTER TABLE', () => {
    expectRejected('ALTER TABLE Clientes ADD COLUMN Hacked INT');
  });

  it('35 — CREATE TABLE', () => {
    expectRejected('CREATE TABLE Hacked (Id INT)');
  });

  it('36 — CREATE VIEW', () => {
    expectRejected('CREATE VIEW HackedView AS SELECT * FROM Clientes');
  });

  it('37 — CREATE PROCEDURE', () => {
    expectRejected('CREATE PROCEDURE HackedProc AS SELECT 1');
  });

  it('38 — TRUNCATE TABLE', () => {
    expectRejected('TRUNCATE TABLE Clientes');
  });

  it('39 — EXEC stored procedure', () => {
    expectRejected('EXEC sp_who');
  });

  it('40 — EXECUTE stored procedure', () => {
    expectRejected('EXECUTE sp_helpdb');
  });

  it('41 — xp_cmdshell', () => {
    expectRejected("EXEC xp_cmdshell 'dir'");
  });

  it('42 — WAITFOR DELAY (DoS)', () => {
    expectRejected("WAITFOR DELAY '00:00:10'");
  });

  it('43 — DECLARE @variable', () => {
    expectRejected("DECLARE @cmd NVARCHAR(1000)");
  });

  it('44 — BACKUP DATABASE', () => {
    expectRejected("BACKUP DATABASE master TO DISK = 'backup.bak'");
  });

  it('45 — RESTORE DATABASE', () => {
    expectRejected("RESTORE DATABASE master FROM DISK = 'backup.bak'");
  });

  it('46 — SHUTDOWN', () => {
    expectRejected('SHUTDOWN');
  });

  it('47 — DBCC command', () => {
    expectRejected('DBCC CHECKDB');
  });

  it('48 — BULK INSERT', () => {
    expectRejected("BULK INSERT Clientes FROM 'data.csv'");
  });

  it('49 — GRANT permissions', () => {
    expectRejected('GRANT SELECT ON Clientes TO public');
  });

  it('50 — REVOKE permissions', () => {
    expectRejected('REVOKE SELECT ON Clientes FROM public');
  });

  it('51 — DENY permissions', () => {
    expectRejected('DENY SELECT ON Clientes TO public');
  });

  it('52 — RECONFIGURE', () => {
    expectRejected('RECONFIGURE');
  });

  it('53 — KILL session', () => {
    expectRejected('KILL 55');
  });

  it('54 — MERGE statement', () => {
    expectRejected('MERGE INTO Clientes AS t USING NewData AS s ON t.Id = s.Id WHEN MATCHED THEN DELETE');
  });

  it('55 — OPENROWSET', () => {
    expectRejected("SELECT * FROM OPENROWSET('SQLOLEDB','server','SELECT 1')");
  });

  it('56 — OPENDATASOURCE', () => {
    expectRejected("SELECT * FROM OPENDATASOURCE('SQLOLEDB','Data Source=server').db.dbo.Clientes");
  });

  it('57 — WRITETEXT', () => {
    expectRejected('WRITETEXT Clientes.Notes @ptr @data');
  });

  it('58 — UPDATETEXT', () => {
    expectRejected('UPDATETEXT Clientes.Notes @ptr 0 NULL @data');
  });

  it('59 — READTEXT', () => {
    expectRejected('READTEXT Clientes.Notes @ptr 0 100');
  });
});

// =====================================================================
// SQL Injection Attempts — MUST REJECT
// =====================================================================

describe('SQL injection attempts', () => {
  it('60 — Classic OR 1=1 with comment', () => {
    expectRejected("SELECT * FROM Clientes WHERE Nome = '' OR 1=1 --'");
  });

  it('61 — Semicolon-separated DROP TABLE', () => {
    expectRejected("SELECT * FROM Clientes; DROP TABLE Clientes");
  });

  it('62 — UNION SELECT from system table', () => {
    // This contains semicolons in some forms, but also test pure UNION injection
    // The UNION itself is allowed, but sys.sql_logins would fail allowlist
    // and the keyword patterns might catch it depending on form
    const sql = "SELECT Nome FROM Clientes UNION SELECT password FROM sys.sql_logins";
    // Should be valid syntactically if no allowlist, but if allowlist is set it fails
    const result = validateSql(sql, { allowedTables: ['Clientes'] });
    assert.equal(result.valid, false);
  });

  it('63 — Hex-encoded payload', () => {
    expectRejected("SELECT * FROM Clientes WHERE Nome = 0x48656C6C6F");
  });

  it('64 — Block comment injection', () => {
    expectRejected("SELECT * FROM Clientes /* hidden payload */ WHERE 1=1");
  });

  it('65 — Single-line comment injection', () => {
    expectRejected("SELECT * FROM Clientes -- WHERE Nome = 'safe'");
  });

  it('66 — Batch with semicolons (multiple statements)', () => {
    expectRejected("SELECT 1; SELECT 2");
  });

  it('67 — SELECT INTO (creates new table)', () => {
    expectRejected("SELECT Nome INTO NewTable FROM Clientes");
  });

  it('68 — sp_executesql injection', () => {
    expectRejected("sp_executesql N'SELECT * FROM Clientes'");
  });

  it('69 — xp_cmdshell in middle of query', () => {
    expectRejected("SELECT * FROM Clientes WHERE 1=1 UNION SELECT xp_cmdshell('whoami')");
  });

  it('70 — Null byte injection', () => {
    expectRejected("SELECT * FROM Clientes\x00WHERE 1=1");
  });

  it('71 — OPENROWSET data exfil', () => {
    expectRejected(
      "SELECT * FROM OPENROWSET('SQLOLEDB','server=attacker;uid=sa;pwd=pass','SELECT * FROM Clientes')"
    );
  });
});

// =====================================================================
// Edge Cases
// =====================================================================

describe('Edge cases', () => {
  it('72 — Empty string', () => {
    expectRejected('');
  });

  it('73 — Whitespace only', () => {
    expectRejected('   \n\t  ');
  });

  it('74 — Very long query exceeding 4000 chars', () => {
    const long = 'SELECT Nome FROM Clientes WHERE Nome IN (' + "'a',".repeat(1500) + "'z')";
    expectRejected(long);
  });

  it('75 — Query with exactly 4000 chars (should pass if valid)', () => {
    // Build a query that's exactly 4000 chars
    const base = 'SELECT Nome FROM Clientes WHERE Nome = ';
    const padding = "'a'".padEnd(4000 - base.length, ' ');
    const sql = base + padding;
    // It might or might not parse, but it should not be rejected for length
    const result = validateSql(sql);
    // Length check should not trigger since it's exactly 4000
    if (!result.valid) {
      assert.notEqual(result.reason, `Query exceeds maximum length of 4000 characters (got ${sql.length})`);
    }
  });

  it('76 — Table not in allowlist (when allowlist active)', () => {
    const result = validateSql('SELECT * FROM SecretTable', {
      allowedTables: ['Clientes', 'CabecDoc'],
    });
    assert.equal(result.valid, false);
    assert.ok(result.reason?.includes('not in the allowed tables list'));
  });

  it('77 — Table IN allowlist (case insensitive)', () => {
    expectValid('SELECT Nome FROM Clientes', {
      allowedTables: ['clientes'],
    });
  });

  it('78 — Too many JOINs (> 8)', () => {
    const sql = `SELECT a.Nome
      FROM Clientes a
      INNER JOIN CabecDoc b ON a.Cliente = b.Entidade
      INNER JOIN LinhasDoc c ON b.Id = c.IdCabecDoc
      INNER JOIN Artigo d ON c.Artigo = d.Artigo
      INNER JOIN Familias e ON d.Familia = e.Familia
      INNER JOIN Fornecedores f ON d.Fornecedor = f.Fornecedor
      INNER JOIN Armazens g ON c.Armazem = g.Armazem
      INNER JOIN Moedas h ON b.Moeda = h.Moeda
      INNER JOIN Paises i ON a.Pais = i.Pais
      INNER JOIN Iva j ON c.CodIva = j.CodIva`;
    // That's 9 JOINs, should be rejected
    expectRejected(sql);
  });

  it('79 — Exactly 8 JOINs (should pass)', () => {
    const sql = `SELECT a.Nome
      FROM Clientes a
      INNER JOIN CabecDoc b ON a.Cliente = b.Entidade
      INNER JOIN LinhasDoc c ON b.Id = c.IdCabecDoc
      INNER JOIN Artigo d ON c.Artigo = d.Artigo
      INNER JOIN Familias e ON d.Familia = e.Familia
      INNER JOIN Fornecedores f ON d.Fornecedor = f.Fornecedor
      INNER JOIN Armazens g ON c.Armazem = g.Armazem
      INNER JOIN Moedas h ON b.Moeda = h.Moeda
      INNER JOIN Paises i ON a.Pais = i.Pais`;
    // That's 8 JOINs, should pass
    expectValid(sql);
  });

  it('80 — Custom max JOINs option', () => {
    const sql = `SELECT a.Nome FROM Clientes a
      INNER JOIN CabecDoc b ON a.Cliente = b.Entidade
      INNER JOIN LinhasDoc c ON b.Id = c.IdCabecDoc`;
    // 2 JOINs with max 1 should fail
    expectRejected(sql, { maxJoins: 1 });
  });

  it('81 — Custom max query length', () => {
    expectRejected('SELECT Nome FROM Clientes', { maxQueryLength: 10 });
  });

  it('82 — Returns table references', () => {
    const result = expectValid(
      'SELECT c.Nome, d.NumDoc FROM Clientes c INNER JOIN CabecDoc d ON c.Cliente = d.Entidade'
    );
    assert.ok(result.tablesReferenced);
    assert.ok(result.tablesReferenced!.length >= 2);
    const tablesLower = result.tablesReferenced!.map((t) => t.toLowerCase());
    assert.ok(tablesLower.includes('clientes'));
    assert.ok(tablesLower.includes('cabecdoc'));
  });

  it('83 — Returns queryType select', () => {
    const result = expectValid('SELECT 1 AS One');
    assert.equal(result.queryType, 'select');
  });

  it('84 — Rejects control characters (bell)', () => {
    expectRejected('SELECT \x07 FROM Clientes');
  });

  it('85 — Allows tabs and newlines', () => {
    expectValid('SELECT\tNome\nFROM\tClientes');
  });
});

// =====================================================================
// SQL Sanitizer Tests
// =====================================================================

describe('SQL Sanitizer', () => {
  it('86 — Trims whitespace', () => {
    assert.equal(sanitizeSql('  SELECT 1  '), 'SELECT 1');
  });

  it('87 — Removes markdown code fences', () => {
    assert.equal(
      sanitizeSql('```sql\nSELECT Nome FROM Clientes\n```'),
      'SELECT Nome FROM Clientes'
    );
  });

  it('88 — Removes trailing semicolons', () => {
    assert.equal(sanitizeSql('SELECT 1;'), 'SELECT 1');
  });

  it('89 — Removes single-line comments', () => {
    assert.equal(
      sanitizeSql('SELECT Nome -- get name\nFROM Clientes'),
      'SELECT Nome FROM Clientes'
    );
  });

  it('90 — Removes block comments', () => {
    assert.equal(
      sanitizeSql('SELECT /* columns */ Nome FROM Clientes'),
      'SELECT Nome FROM Clientes'
    );
  });

  it('91 — Normalizes whitespace', () => {
    assert.equal(
      sanitizeSql('SELECT   Nome   FROM   Clientes'),
      'SELECT Nome FROM Clientes'
    );
  });

  it('92 — Extracts SQL from JSON wrapper', () => {
    const json = JSON.stringify({ sql: 'SELECT Nome FROM Clientes' });
    assert.equal(sanitizeSql(json), 'SELECT Nome FROM Clientes');
  });

  it('93 — Handles empty input', () => {
    assert.equal(sanitizeSql(''), '');
  });

  it('94 — Handles null-ish input', () => {
    assert.equal(sanitizeSql(null as any), '');
    assert.equal(sanitizeSql(undefined as any), '');
  });

  it('95 — Removes multiple trailing semicolons', () => {
    assert.equal(sanitizeSql('SELECT 1;;;'), 'SELECT 1');
  });

  it('96 — Handles code fence without language tag', () => {
    assert.equal(
      sanitizeSql('```\nSELECT 1\n```'),
      'SELECT 1'
    );
  });
});

// =====================================================================
// Table Allowlist Tests
// =====================================================================

describe('Table Allowlist', () => {
  it('97 — isAllowed is case-insensitive', () => {
    const list = new TableAllowlist(['Clientes', 'CabecDoc']);
    assert.ok(list.isAllowed('clientes'));
    assert.ok(list.isAllowed('CLIENTES'));
    assert.ok(list.isAllowed('Clientes'));
  });

  it('98 — rejects unknown tables', () => {
    const list = new TableAllowlist(['Clientes']);
    assert.equal(list.isAllowed('sys.objects'), false);
  });

  it('99 — handles schema-qualified names', () => {
    const list = new TableAllowlist(['Clientes']);
    assert.ok(list.isAllowed('dbo.Clientes'));
  });

  it('100 — default Primavera allowlist has expected tables', () => {
    const defaults = TableAllowlist.getDefaultPrimaveraAllowlist();
    const lower = defaults.map((t) => t.toLowerCase());
    assert.ok(lower.includes('cabecdoc'));
    assert.ok(lower.includes('linhasdoc'));
    assert.ok(lower.includes('clientes'));
    assert.ok(lower.includes('fornecedores'));
    assert.ok(lower.includes('artigo'));
    assert.ok(lower.includes('movimentos'));
    assert.ok(lower.includes('planocontas'));
    assert.ok(lower.includes('funcionarios'));
    assert.ok(defaults.length >= 50, `Expected at least 50 tables, got ${defaults.length}`);
  });

  it('101 — getAllowed returns sorted list', () => {
    const list = new TableAllowlist(['Zebra', 'Apple', 'Mango']);
    const result = list.getAllowed();
    assert.deepEqual(result, ['apple', 'mango', 'zebra']);
  });

  it('102 — default allowlist does NOT include system tables', () => {
    const defaults = TableAllowlist.getDefaultPrimaveraAllowlist();
    const lower = defaults.map((t) => t.toLowerCase());
    assert.ok(!lower.includes('sys.objects'));
    assert.ok(!lower.includes('sysobjects'));
    assert.ok(!lower.includes('information_schema.tables'));
    assert.ok(!lower.includes('master'));
    assert.ok(!lower.includes('msdb'));
  });
});

// =====================================================================
// Additional Security Regression Tests
// =====================================================================

describe('Security regression — additional attack vectors', () => {
  it('103 — Double semicolon bypass attempt', () => {
    expectRejected('SELECT 1;; SELECT 2');
  });

  it('104 — Tab-separated statements', () => {
    // No semicolons but multiple statements — parser should catch this
    // Actually without semicolons the parser may treat it as one garbled query
    // and fail to parse. Either way, it shouldn't pass as valid.
    const sql = "SELECT 1\tDROP TABLE Clientes";
    expectRejected(sql);
  });

  it('105 — RENAME keyword', () => {
    expectRejected('RENAME TABLE Clientes TO Hacked');
  });

  it('106 — SET @variable', () => {
    expectRejected("SET @x = 1");
  });

  it('107 — SELECT with OPENQUERY', () => {
    expectRejected("SELECT * FROM OPENQUERY(LinkedServer, 'SELECT * FROM Clientes')");
  });

  it('108 — Deeply nested subquery (depth > 3)', () => {
    const sql = `SELECT a FROM T1
      WHERE a IN (SELECT b FROM T2
        WHERE b IN (SELECT c FROM T3
          WHERE c IN (SELECT d FROM T4
            WHERE d IN (SELECT e FROM T5))))`;
    expectRejected(sql, { maxSubqueryDepth: 3 });
  });

  it('109 — Valid query with allowedTables passes', () => {
    expectValid('SELECT Nome FROM Clientes', {
      allowedTables: ['Clientes'],
    });
  });

  it('110 — Multiple blocked keywords in one query', () => {
    expectRejected("INSERT INTO Clientes SELECT * FROM OPENROWSET('x','y','z')");
  });

  it('111 — Case variation of blocked keywords', () => {
    expectRejected("DeLeTe FROM Clientes");
  });

  it('112 — EXEC with mixed case', () => {
    expectRejected('ExEc sp_who');
  });

  it('113 — Hex literal detection', () => {
    expectRejected("SELECT * FROM Clientes WHERE Id = 0xDEADBEEF");
  });

  it('114 — SELECT with string containing "execution" should fail due to EXECUTE regex', () => {
    // This is a known false positive — the word "execution" triggers EXECUTE regex.
    // This is a security trade-off: we prefer false positives over false negatives.
    const result = validateSql("SELECT * FROM Clientes WHERE Descricao = 'execution plan'");
    // We accept that this may be rejected — security over convenience
    // The regex \bEXECUTE\b would not match "execution" since "execution" != "execute"
    // Actually \bEXECUTE\b should NOT match "execution" because "execution" has extra chars
    // Let's verify: the regex is /\bEXECUTE\b/i — "execution" has 'i','o','n' after 'execute'
    // so \b after EXECUTE won't match inside "execution". This should actually pass!
    // But EXEC will match the first 4 chars... let's check: /\bEXEC\b/i on "execution"
    // "exec" in "execution" — the \b after EXEC: 'u' is a word char, so no boundary. PASSES.
    assert.equal(result.valid, true);
  });

  it('115 — SELECT literal with INSERT word in string should still be blocked', () => {
    // Even if INSERT is inside a string literal, the regex layer blocks it.
    // This is intentional — defense in depth. The AI should not generate
    // queries that contain INSERT anywhere.
    const result = validateSql("SELECT * FROM Clientes WHERE Notes = 'INSERT data here'");
    assert.equal(result.valid, false);
  });
});

// =====================================================================
// Security Hardening Tests (V-01 through V-09)
// =====================================================================

describe('Security hardening — new vulnerability fixes', () => {
  it('V-01 — SELECT * FROM sys.sql_logins is rejected by allowlist', () => {
    const allowlist = TableAllowlist.getDefaultPrimaveraAllowlist();
    expectRejected('SELECT * FROM sql_logins', { allowedTables: allowlist });
  });

  it('V-01 — sys.objects rejected by allowlist', () => {
    const list = new TableAllowlist(['Clientes']);
    assert.equal(list.isAllowed('sys.objects'), false);
  });

  it('V-01 — sysobjects rejected by allowlist', () => {
    const list = new TableAllowlist(['Clientes']);
    assert.equal(list.isAllowed('sysobjects'), false);
  });

  it('V-01 — information_schema.tables rejected by allowlist', () => {
    const list = new TableAllowlist(['Clientes']);
    assert.equal(list.isAllowed('information_schema.tables'), false);
  });

  it('V-02 — SELECT INTO #temp is rejected', () => {
    expectRejected('SELECT Nome INTO #temp FROM Clientes');
  });

  it('V-02 — SELECT INTO @tableVar is rejected', () => {
    expectRejected('SELECT Nome INTO @tableVar FROM Clientes');
  });

  it('V-03 — SELECT * FROM master.dbo.Clientes is rejected (three-part name)', () => {
    expectRejected('SELECT * FROM master.dbo.Clientes');
  });

  it('V-03 — allowlist rejects three-part names', () => {
    const list = new TableAllowlist(['Clientes']);
    assert.equal(list.isAllowed('master.dbo.Clientes'), false);
  });

  it('V-04 — SELECT DB_NAME() is rejected', () => {
    expectRejected('SELECT DB_NAME()');
  });

  it('V-04 — SUSER_SNAME() is rejected', () => {
    expectRejected('SELECT SUSER_SNAME()');
  });

  it('V-04 — HAS_PERMS_BY_NAME is rejected', () => {
    expectRejected("SELECT HAS_PERMS_BY_NAME('Clientes', 'OBJECT', 'SELECT')");
  });

  it('V-05 — SELECT * FROM Clientes FOR XML PATH is rejected', () => {
    expectRejected("SELECT * FROM Clientes FOR XML PATH('')");
  });

  it('V-05 — FOR JSON is rejected', () => {
    expectRejected('SELECT * FROM Clientes FOR JSON PATH');
  });

  it('V-09 — CROSS JOIN is rejected', () => {
    expectRejected('SELECT * FROM Clientes CROSS JOIN Clientes');
  });
});
