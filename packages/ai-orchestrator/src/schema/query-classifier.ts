import type { SchemaCategory } from '@apura/shared';

/**
 * QueryClassifier — classifies natural language queries into Primavera
 * ERP schema categories using keyword matching.
 *
 * This is a fast, zero-latency classification that avoids an extra AI call.
 * Returns 1-2 categories to select relevant schema tables.
 */

type CategoryKeywords = { category: SchemaCategory; keywords: string[] };

const CATEGORY_KEYWORD_MAP: CategoryKeywords[] = [
  {
    category: 'vendas',
    keywords: [
      'vendas', 'venda', 'fatura', 'factura', 'invoice', 'cliente', 'clientes',
      'customer', 'receita', 'revenue', 'faturação', 'facturação', 'billing',
      'nota de crédito', 'credit note', 'devoluções', 'devolução',
    ],
  },
  {
    category: 'compras',
    keywords: [
      'compra', 'compras', 'fornecedor', 'fornecedores', 'supplier', 'suppliers',
      'purchase', 'purchases', 'encomenda', 'encomendas', 'order', 'orders',
      'requisição', 'procurement',
    ],
  },
  {
    category: 'financeiro',
    keywords: [
      'contabilidade', 'conta', 'contas', 'account', 'accounts', 'diário',
      'journal', 'balancete', 'balanço', 'balance', 'resultado', 'resultados',
      'lucro', 'prejuízo', 'profit', 'loss', 'lançamento', 'lançamentos',
      'plano de contas', 'chart of accounts', 'custo', 'custos', 'cost',
      'pendente', 'outstanding', 'saldo', 'dívida', 'debt', 'receber',
      'receivable', 'pagar', 'payable', 'conta corrente', 'contas correntes',
    ],
  },
  {
    category: 'rh',
    keywords: [
      'funcionário', 'funcionários', 'employee', 'employees', 'salário',
      'salários', 'salary', 'salaries', 'departamento', 'departamentos',
      'department', 'férias', 'vacation', 'ausência', 'ausências', 'absence',
      'rh', 'recursos humanos', 'human resources', 'hr', 'pessoal', 'staff',
    ],
  },
  {
    category: 'stocks',
    keywords: [
      'stock', 'stocks', 'artigo', 'artigos', 'product', 'products', 'armazém',
      'armazéns', 'warehouse', 'warehouses', 'inventário', 'inventory',
      'família', 'famílias', 'family', 'families', 'lote', 'lotes', 'batch',
      'item', 'itens', 'items',
    ],
  },
  {
    category: 'tesouraria',
    keywords: [
      'banco', 'bancos', 'bank', 'banks', 'tesouraria', 'treasury',
      'pagamento', 'pagamentos', 'payment', 'payments', 'caixa', 'cash',
      'recebimento', 'recebimentos', 'receipt', 'receipts', 'transferência',
      'transferências', 'transfer',
    ],
  },
];

/**
 * Classify a natural language query into 1-2 schema categories.
 * Uses keyword matching for fast, deterministic classification.
 *
 * If no keywords match, defaults to ['vendas'] (most common query type).
 */
export function classifyQuery(naturalLanguage: string): SchemaCategory[] {
  const input = naturalLanguage.toLowerCase().normalize('NFD');

  // Score each category by counting keyword matches
  const scores: { category: SchemaCategory; score: number }[] = [];

  for (const entry of CATEGORY_KEYWORD_MAP) {
    let score = 0;
    for (const keyword of entry.keywords) {
      const normalizedKeyword = keyword.toLowerCase().normalize('NFD');
      if (input.includes(normalizedKeyword)) {
        // Longer keyword matches are more specific, weight them higher
        score += keyword.length;
      }
    }
    if (score > 0) {
      scores.push({ category: entry.category, score });
    }
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  // Return top 2 categories, or default to ['vendas']
  if (scores.length === 0) {
    return ['vendas'];
  }

  // Only include second category if it has at least half the score of the first
  const result: SchemaCategory[] = [scores[0].category];
  if (scores.length > 1 && scores[1].score >= scores[0].score * 0.5) {
    result.push(scores[1].category);
  }

  return result;
}
