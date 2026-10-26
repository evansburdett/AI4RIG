/**
 * Reading RIG's model portfolio spreadsheet (Models.xlsx, 10/26). Its layout:
 * a row with only a model's name, then one row per fund with its symbol and
 * its weight, then the next model's name.
 *
 *   American Funds Growth Model Portfolio
 *   AMCFX     0.10
 *   GFFFX     0.21
 *   ...
 *
 * Weights may be fractions (0.21) or percentages (21); each model is read
 * whichever way makes it add up to 100%. This only reads and checks; nothing
 * is saved until the advisor has looked at what it found.
 */

import { WHOLE_BPS } from './percent.js';
import { isValidSymbol, normalizeSymbol } from './tickers.js';
import { CASH_SYMBOL } from './tickerGuesses.js';
import { cellText, toScaledInteger } from './decimal.js';
import { MODEL_NAME_MAX } from './types.js';
import type { ModelLine } from './types.js';

export interface ImportedModel {
  readonly name: string;
  readonly lines: readonly ModelLine[];
  /** Things changed on the way in that the advisor should know about. */
  readonly notes: readonly string[];
}

export interface ModelsFile {
  readonly models: readonly ImportedModel[];
  /** Anything that stops the import until the file is fixed. */
  readonly problems: readonly string[];
}

/** Weights are read to the millionth of the whole, then rounded to basis points. */
const WHOLE_MICROS = 1_000_000;
/** Spreadsheet rounding: a model may add up to 99.9999% or 100.0001%. */
const TOLERANCE_MICROS = 100;

/** "USD CASH", "Cash", "$CASH": a model's cash line, however a vendor writes it. */
function symbolFor(text: string): string {
  const upper = text.trim().toUpperCase();
  if (/^(USD\s*)?\$?\s*CASH$/.test(upper) || upper === 'CASH & EQUIVALENTS') return CASH_SYMBOL;
  return normalizeSymbol(upper);
}

interface DraftModel {
  name: string;
  row: number;
  lines: { symbol: string; micros: number; row: number }[];
  notes: string[];
}

export function readModelsSheet(rows: readonly (readonly unknown[])[]): ModelsFile {
  const problems: string[] = [];
  const drafts: DraftModel[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const first = cellText(row[0]);
    const second = cellText(row[1]);
    if (first === '' && second === '') return;

    if (second === '') {
      if (first.length > MODEL_NAME_MAX) {
        problems.push(`Row ${rowNumber}: a model name is longer than ${MODEL_NAME_MAX} characters.`);
      }
      drafts.push({ name: first, row: rowNumber, lines: [], notes: [] });
      return;
    }

    const model = drafts.at(-1);
    if (model === undefined) {
      problems.push(`Row ${rowNumber}: ${first} has a weight but no model name above it.`);
      return;
    }

    const symbol = symbolFor(first);
    if (!isValidSymbol(symbol)) {
      problems.push(`Row ${rowNumber}: "${first}" in ${model.name} is not a ticker symbol.`);
      return;
    }
    const micros = toScaledInteger(second, 6);
    if (micros === null || micros < 0) {
      problems.push(`Row ${rowNumber}: ${symbol}'s weight "${second}" in ${model.name} is not a number.`);
      return;
    }
    model.lines.push({ symbol, micros, row: rowNumber });
  });

  const models: ImportedModel[] = [];
  for (const draft of drafts) {
    const read = finishModel(draft, problems);
    if (read === null) continue;

    // The same model listed twice: keep one if they match, otherwise ask.
    const earlier = models.findIndex((m) => m.name.toLowerCase() === read.name.toLowerCase());
    if (earlier === -1) {
      models.push(read);
    } else if (sameLines(models[earlier]!.lines, read.lines)) {
      models[earlier] = { ...models[earlier]!, notes: [...models[earlier]!.notes, 'Listed twice in the file; imported once.'] };
    } else {
      problems.push(`${read.name} is listed twice with different funds (rows ${draft.row} and earlier). Keep one.`);
    }
  }

  return { models, problems };
}

function finishModel(draft: DraftModel, problems: string[]): ImportedModel | null {
  const notes: string[] = [];
  if (draft.lines.length === 0) {
    problems.push(`${draft.name} (row ${draft.row}) has no funds under it.`);
    return null;
  }

  // Fractions add up to 1, percentages to 100.
  const total = draft.lines.reduce((sum, line) => sum + line.micros, 0);
  const asPercent = Math.abs(total - 100 * WHOLE_MICROS) <= 100 * TOLERANCE_MICROS;
  const scaled = draft.lines.map((line) => ({ ...line, micros: asPercent ? Math.round(line.micros / 100) : line.micros }));
  const scaledTotal = scaled.reduce((sum, line) => sum + line.micros, 0);
  if (Math.abs(scaledTotal - WHOLE_MICROS) > TOLERANCE_MICROS) {
    problems.push(`${draft.name} adds up to ${formatMicrosAsPercent(scaledTotal)}, not 100%.`);
    return null;
  }

  // A model cannot hold a fund at 0%; the vendor listed it but holds none.
  const held = scaled.filter((line) => line.micros > 0);
  const dropped = scaled.filter((line) => line.micros === 0).map((line) => line.symbol);
  if (dropped.length > 0) notes.push(`Left out at 0%: ${dropped.join(', ')}.`);

  // The same fund twice in one model is added together.
  const merged = new Map<string, number>();
  for (const line of held) merged.set(line.symbol, (merged.get(line.symbol) ?? 0) + line.micros);
  if (merged.size < held.length) notes.push('A fund listed twice was added together.');

  const lines = toBasisPoints([...merged].map(([symbol, micros]) => ({ symbol, micros })));
  const exact = [...merged.values()].every((micros) => micros % 100 === 0);
  if (!exact) notes.push('Some weights are finer than 0.01% and were rounded; the model still adds up to 100%.');

  return { name: draft.name, lines, notes };
}

/** Largest remainder, like splitByWeights: rounded to 0.01% and still exactly 100%. */
function toBasisPoints(lines: readonly { symbol: string; micros: number }[]): ModelLine[] {
  const total = lines.reduce((sum, line) => sum + line.micros, 0);
  const pieces = lines.map((line, index) => {
    const scaled = line.micros * WHOLE_BPS;
    return { symbol: line.symbol, index, bps: Math.floor(scaled / total), remainder: scaled % total };
  });
  let leftover = WHOLE_BPS - pieces.reduce((sum, p) => sum + p.bps, 0);
  for (const piece of [...pieces].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
    if (leftover === 0) break;
    piece.bps += 1;
    leftover -= 1;
  }
  return pieces.filter((p) => p.bps > 0).map((p) => ({ tickerSymbol: p.symbol, weightBps: p.bps }));
}

function sameLines(a: readonly ModelLine[], b: readonly ModelLine[]): boolean {
  return a.length === b.length && a.every((line, i) => line.tickerSymbol === b[i]?.tickerSymbol && line.weightBps === b[i]?.weightBps);
}

function formatMicrosAsPercent(micros: number): string {
  return `${(micros / 10_000).toFixed(4).replace(/\.?0+$/, '')}%`;
}
