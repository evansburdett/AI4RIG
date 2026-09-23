/**
 * Model weights are basis points (1% = 100, 100% = 10000) so they are whole
 * numbers and a model adds up to exactly 100%. These convert to and from what
 * the advisor types: "12.5" means 12.5%.
 */

import { WHOLE_BPS } from '@ai4rig/engine';

export { WHOLE_BPS };

/** "12.5" -> 1250. Null when the text is not a percentage with at most two decimals. */
export function parsePercentToBps(text: string): number | null {
  const cleaned = text.trim().replace(/%$/, '').trim();
  const match = /^(\d{1,3})(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) return null;

  const [, whole = '0', fraction = ''] = match;
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return bps <= WHOLE_BPS ? bps : null;
}

/** 1250 -> "12.5". Trailing zeros dropped, so 6000 is "60". */
export function bpsToPercentInput(bps: number): string {
  return (bps / 100).toFixed(2).replace(/\.?0+$/, '');
}

export function formatBps(bps: number): string {
  return `${bpsToPercentInput(bps)}%`;
}
