/** Chart visualization configuration. */
export interface ChartConfig {
  /** Chart type to render. */
  type: 'bar' | 'line' | 'pie' | 'area' | 'scatter' | 'table';
  /** X-axis mapping. */
  xAxis?: { field: string; label: string };
  /** Y-axis mapping. */
  yAxis?: { field: string; label: string };
  /** Sort order for the primary axis. */
  sort?: 'asc' | 'desc';
  /** Maximum data points to display. */
  limit?: number;
  /** Custom colour palette (hex or CSS colour names). */
  colors?: string[];
}

/** Layout definition for a single column in a tabular report. */
export interface ColumnLayout {
  /** Source field name from the query result. */
  field: string;
  /** Display label. */
  label: string;
  /** Column width in pixels. */
  width?: number;
  /** Value formatting hint. */
  format?: 'text' | 'number' | 'currency' | 'date' | 'percentage';
  /** Text alignment. */
  align?: 'left' | 'center' | 'right';
}

/** Table layout configuration for a report. */
export interface LayoutConfig {
  /** Column definitions. */
  columns: ColumnLayout[];
  /** Whether to show totals row. */
  showTotals?: boolean;
  /** Rows per page. */
  pageSize?: number;
}

/** Report record as stored in D1. */
export interface Report {
  id: string;
  org_id: string;
  user_id: string;
  name: string;
  description: string | null;
  query_id: string;
  chart_config: string | null;
  layout_config: string | null;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}
