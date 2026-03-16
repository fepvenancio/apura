/**
 * Table Allowlist — manages per-tenant allowed tables for SQL validation.
 *
 * Only tables in the allowlist can be referenced in AI-generated queries.
 * All comparisons are case-insensitive since SQL Server is typically CI.
 */

export class TableAllowlist {
  private tables: Set<string>;

  constructor(allowedTables: string[]) {
    this.tables = new Set(allowedTables.map((t) => t.toLowerCase()));
  }

  /**
   * Check if a table name is in the allowlist.
   * Handles schema-qualified names (e.g., "dbo.CabecDoc" checks both
   * the full name and the table part after the dot).
   */
  isAllowed(tableName: string): boolean {
    const lower = tableName.toLowerCase();

    // Direct match
    if (this.tables.has(lower)) {
      return true;
    }

    // If it's schema-qualified (e.g., dbo.CabecDoc), check just the table part
    const dotIndex = lower.lastIndexOf('.');
    if (dotIndex >= 0) {
      const tableOnly = lower.substring(dotIndex + 1);
      if (this.tables.has(tableOnly)) {
        return true;
      }
    }

    // Check if any allowlisted entry matches without schema
    for (const allowed of this.tables) {
      const allowedDot = allowed.lastIndexOf('.');
      if (allowedDot >= 0) {
        const allowedTable = allowed.substring(allowedDot + 1);
        if (allowedTable === lower) {
          return true;
        }
      }
    }

    return false;
  }

  getAllowed(): string[] {
    return Array.from(this.tables).sort();
  }

  /**
   * Default Primavera ERP tables that are safe for read-only queries.
   * These are the main business tables — NO system tables included.
   */
  static getDefaultPrimaveraAllowlist(): string[] {
    return [
      // === Documents (Sales/Purchases) ===
      'CabecDoc',           // Document headers (invoices, credit notes, etc.)
      'LinhasDoc',          // Document lines
      'CabecDocStatus',     // Document status
      'DocumentosVenda',    // Sales documents view
      'DocumentosCompra',   // Purchase documents view
      'CabecCompras',       // Purchase headers
      'LinhasCompras',      // Purchase lines

      // === Customers ===
      'Clientes',           // Customers
      'ClientesOutrosEnderecos', // Customer alternate addresses
      'ClientesMoradas',    // Customer addresses
      'ClientesContactos',  // Customer contacts
      'TipoTerceiro',       // Third-party types

      // === Suppliers ===
      'Fornecedores',       // Suppliers
      'FornecedoresOutrosEnderecos', // Supplier alternate addresses
      'FornecedoresMoradas', // Supplier addresses
      'FornecedoresContactos', // Supplier contacts

      // === Products / Items ===
      'Artigo',             // Products/Items
      'ArtigoMoeda',        // Product currency info
      'ArtigoArmazem',      // Product warehouse stock
      'Familias',           // Product families
      'SubFamilias',        // Product sub-families
      'UnidadesBase',       // Base units
      'Marcas',             // Brands
      'Modelos',            // Models

      // === Financials / Accounting ===
      'Movimentos',         // Financial movements / transactions
      'MovimentosLinha',    // Movement lines
      'PlanoContas',        // Chart of accounts
      'CentrosCusto',       // Cost centers
      'DiarioContabilidade', // Accounting journal
      'LancamentosContabilidade', // Accounting entries
      'PeriodosContabilidade', // Accounting periods
      'Bancos',             // Banks
      'ContasBancarias',    // Bank accounts
      'MovimentosBancarios', // Bank movements

      // === HR / Employees ===
      'Funcionarios',       // Employees
      'FuncionariosDados',  // Employee data
      'Departamentos',      // Departments
      'CategoriasProfissionais', // Professional categories
      'ProcessamentoSalarios', // Salary processing
      'FalhasPresencas',    // Attendance/absences

      // === Inventory / Warehouse ===
      'Armazens',           // Warehouses
      'StockArtigo',        // Article stock
      'MovimentosStock',    // Stock movements
      'Inventario',         // Inventory
      'Lotes',              // Batches/Lots

      // === Pricing ===
      'Precos',             // Prices
      'TabelasPrecos',      // Price tables
      'LinhasTabelaPrecos', // Price table lines
      'Descontos',          // Discounts

      // === Tax ===
      'Iva',                // VAT rates
      'TaxasIva',           // VAT rate values
      'RegimesIva',         // VAT regimes

      // === General / Config ===
      'Moedas',             // Currencies
      'MoedaCambios',       // Exchange rates
      'Paises',             // Countries
      'Distritos',          // Districts
      'Concelhos',          // Municipalities
      'CondicoesPagamento', // Payment conditions
      'ModoPagamento',      // Payment methods
      'SeriesDocumentos',   // Document series
      'TiposDocumento',     // Document types
      'Exercicios',         // Fiscal years
      'Empresas',           // Companies
    ];
  }
}
