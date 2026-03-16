/** Primavera ERP module categories (Portuguese). */
export type SchemaCategory =
  | 'vendas'
  | 'compras'
  | 'financeiro'
  | 'stocks'
  | 'rh'
  | 'tesouraria'
  | 'activos'
  | 'projectos'
  | 'manutencao'
  | 'fiscal'
  | 'geral';

/** Metadata for a single database column. */
export interface SchemaColumn {
  /** Column name. */
  name: string;
  /** SQL Server data type. */
  type: string;
  /** Whether this column is part of the primary key. */
  isPrimaryKey?: boolean;
  /** Whether this column is a foreign key. */
  isForeignKey?: boolean;
  /** Target table.column if this is a foreign key (e.g. "Clientes.Cliente"). */
  fkReferences?: string;
  /** English description. */
  description?: string;
  /** Portuguese description. */
  descriptionPt?: string;
}

/** Metadata for a Primavera table used in schema context. */
export interface SchemaTable {
  /** Table name as it appears in SQL Server. */
  tableName: string;
  /** English description of the table's purpose. */
  description: string;
  /** Portuguese description of the table's purpose. */
  descriptionPt: string;
  /** ERP module category. */
  category: SchemaCategory;
  /** Column definitions. */
  columns: SchemaColumn[];
  /** Approximate row count (for query planning hints). */
  rowCountApprox?: number;
}

/** A few-shot example used to guide AI SQL generation. */
export interface FewShotExample {
  /** ERP module category this example belongs to. */
  category: SchemaCategory;
  /** Natural-language question in Portuguese. */
  naturalLanguagePt: string;
  /** Optional English translation. */
  naturalLanguageEn?: string;
  /** The correct SQL query. */
  sql: string;
  /** Tables referenced in the query. */
  tablesUsed: string[];
}
