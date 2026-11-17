/**
 * A model as a CSV of symbols and weights (RIG, 11/2), for uploading to
 * YCharts, which runs the stress tests and historical performance on it.
 */

import type { ModelPortfolio } from './types.js';

/** "Symbol,Weight" then one row per fund, weights in percent to two places. */
export function modelCsv(model: ModelPortfolio): string {
  const rows = model.lines.map((line) => `${line.tickerSymbol},${(line.weightBps / 100).toFixed(2)}`);
  return ['Symbol,Weight', ...rows].join('\r\n') + '\r\n';
}

/** A file name from the model's name: letters, digits, and dashes. */
export function modelCsvName(model: ModelPortfolio): string {
  const slug = model.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  return `${slug === '' ? 'model' : slug}.csv`;
}
