/**
 * Reading a custodian export of what one account holds (RIG's sample, 10/26):
 * a header row, then one row per holding with its symbol, description, the
 * custodian's asset class, quantity, price, market value, and share of the
 * account. Columns are found by their headings, so a different custodian's
 * order still reads.
 *
 * Every row is checked before anything is saved: that quantity times price
 * comes to the market value, that the percentages add up, that each symbol
 * can be a ticker. The custodian's asset class is used to guess ours, and a
 * bucket, for symbols the universe does not have yet.
 */

import { cellText, toScaledInteger } from './decimal.js';
import { isValidSymbol, normalizeSymbol } from './tickers.js';
import type { Account, AccountLine, AssetClass, BucketType } from './types.js';

export interface ImportedHolding {
  /** Row in the file, for messages. */
  readonly row: number;
  /** As the custodian wrote it. */
  readonly rawSymbol: string;
  /** Upper-cased; may not be a valid ticker (see `problem`). */
  readonly symbol: string;
  readonly description: string;
  /** The custodian's own class, such as "Large US Bl Eq". */
  readonly custodianClass: string;
  readonly sharesMicros: number | null;
  readonly priceCents: number | null;
  /** The price exactly as the file gives it, in millionths of a dollar. */
  readonly priceMicros: number | null;
  readonly marketValueCents: number;
  /** Our asset class and bucket for this holding, guessed from the custodian's class. */
  readonly assetClass: AssetClass;
  readonly bucket: BucketType;
  /** Shown beside the row; the row can still be imported. */
  readonly warning: string | null;
  /** Why the row cannot be imported as it is. */
  readonly problem: string | null;
}

export interface HoldingsFile {
  readonly holdings: readonly ImportedHolding[];
  readonly totalCents: number;
  /** About the file as a whole. */
  readonly warnings: readonly string[];
  /** Stop the import: no header row, no symbol column, nothing in it. */
  readonly problems: readonly string[];
}

type Column = 'symbol' | 'description' | 'custodianClass' | 'quantity' | 'price' | 'marketValue' | 'percent';

/** Tried in this order, so "Market Value" is not taken for the price and "Percent" not for the value. */
const HEADINGS: readonly [Column, RegExp][] = [
  ['percent', /percent|%|weight|allocation/i],
  ['marketValue', /market\s*value|^value$|current\s*value/i],
  ['price', /price|nav/i],
  ['quantity', /quantity|shares|qty|units/i],
  ['custodianClass', /asset\s*class|class|category/i],
  ['symbol', /symbol|ticker|cusip/i],
  ['description', /description|name|fund|security/i],
];

/** A difference smaller than this between quantity × price and the market value is rounding. */
const MATCH_TOLERANCE_CENTS = 100;

export function readHoldingsSheet(rows: readonly (readonly unknown[])[]): HoldingsFile {
  const headerIndex = rows.findIndex((row) => row.some((cell) => /symbol|ticker|cusip/i.test(cellText(cell))));
  if (headerIndex === -1) {
    return { holdings: [], totalCents: 0, warnings: [], problems: ['No heading row with a Symbol column was found.'] };
  }

  const columns = new Map<Column, number>();
  rows[headerIndex]!.forEach((cell, index) => {
    const heading = cellText(cell);
    const match = HEADINGS.find(([column, pattern]) => !columns.has(column) && pattern.test(heading));
    if (match !== undefined) columns.set(match[0], index);
  });
  if (!columns.has('marketValue') && !(columns.has('quantity') && columns.has('price'))) {
    return {
      holdings: [],
      totalCents: 0,
      warnings: [],
      problems: ['The file needs a Market Value column, or Quantity and Price columns.'],
    };
  }

  const read = (row: readonly unknown[], column: Column) => {
    const index = columns.get(column);
    return index === undefined ? '' : cellText(row[index]);
  };

  const holdings: ImportedHolding[] = [];
  let percentMicros = 0;
  let percentSeen = false;

  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const rowNumber = headerIndex + offset + 2;
    const rawSymbol = read(row, 'symbol');
    const description = read(row, 'description');
    // Blank rows, and the totals line custodians add at the bottom.
    if (rawSymbol === '' && description === '') return;
    if (/^(account\s+)?total/i.test(rawSymbol) || /^(account\s+)?total/i.test(description)) return;

    const sharesMicros = toScaledInteger(read(row, 'quantity'), 6);
    const priceCents = toScaledInteger(read(row, 'price'), 2);
    const priceMicros = toScaledInteger(read(row, 'price'), 6);
    const statedValue = toScaledInteger(read(row, 'marketValue'), 2);
    const worked =
      sharesMicros === null || read(row, 'price') === ''
        ? null
        : quantityTimesPrice(read(row, 'quantity'), read(row, 'price'));
    const marketValueCents = statedValue ?? worked ?? 0;

    const percent = toScaledInteger(read(row, 'percent'), 6);
    if (percent !== null) {
      percentMicros += percent;
      percentSeen = true;
    }

    const custodianClass = read(row, 'custodianClass');
    const { assetClass, bucket } = guessFromCustodianClass(custodianClass, description);
    const symbol = normalizeSymbol(rawSymbol);

    let warning: string | null = null;
    if (statedValue !== null && worked !== null && Math.abs(worked - statedValue) > MATCH_TOLERANCE_CENTS) {
      warning = `Quantity × price is ${dollars(worked)}, but the market value says ${dollars(statedValue)}.`;
    } else if (sharesMicros === null) {
      warning = 'No quantity: imported by market value only.';
    }

    let problem: string | null = null;
    if (rawSymbol === '') problem = 'No symbol.';
    else if (!isValidSymbol(symbol)) problem = `"${rawSymbol}" cannot be a ticker (letters, digits, dots, and dashes, up to 10).`;
    else if (marketValueCents <= 0) problem = 'No market value.';
    else if (sharesMicros !== null && sharesMicros < 0) problem = 'Negative quantity (a short position).';

    holdings.push({
      row: rowNumber,
      rawSymbol,
      symbol,
      description,
      custodianClass,
      sharesMicros,
      priceCents: priceCents !== null && priceCents > 0 ? priceCents : null,
      priceMicros: priceMicros !== null && priceMicros > 0 ? priceMicros : null,
      marketValueCents,
      assetClass,
      bucket,
      warning,
      problem,
    });
  });

  const warnings: string[] = [];
  const symbols = holdings.map((h) => h.symbol);
  const repeated = [...new Set(symbols.filter((s, i) => symbols.indexOf(s) !== i))];
  if (repeated.length > 0) warnings.push(`Listed more than once, and added together: ${repeated.join(', ')}.`);
  // The share-of-account column should come to 100% (as 1 or as 100).
  if (percentSeen && Math.abs(percentMicros - 1_000_000) > 1_000 && Math.abs(percentMicros - 100_000_000) > 100_000) {
    warnings.push('The "percent of account" column does not add up to 100%; some holdings may be missing from the file.');
  }
  if (holdings.length === 0) return { holdings, totalCents: 0, warnings, problems: ['No holdings were found under the heading row.'] };

  const totalCents = holdings.filter((h) => h.problem === null).reduce((sum, h) => sum + h.marketValueCents, 0);
  return { holdings, totalCents, warnings, problems: [] };
}

/** Quantity times price in cents, exactly: both kept as scaled integers, rounded once. */
function quantityTimesPrice(quantity: string, price: string): number | null {
  const shares = toScaledInteger(quantity, 6);
  const priceMicros = toScaledInteger(price, 6);
  if (shares === null || priceMicros === null) return null;
  // micro-shares × micro-dollars = 1e-12 dollars; cents are 1e-2. Split to stay
  // inside safe integers for any realistic account.
  const product = (BigInt(shares) * BigInt(priceMicros) + 5_000_000_000n) / 10_000_000_000n;
  return Number(product);
}

/**
 * Our asset class and bucket from the custodian's: "Cash and Equiv" is cash
 * in Now; any bond or muni is fixed income in Soon; derivative-income and
 * other option-writing funds are alternatives in Soon, held for income;
 * real estate and commodities are real assets in Later; everything else is
 * equity in Later. A guess the advisor confirms in the preview.
 */
export function guessFromCustodianClass(custodianClass: string, description = ''): { assetClass: AssetClass; bucket: BucketType } {
  // The custodian's class when there is one. A fund's name misleads: "Pacer
  // US Cash Cows 100 ETF" is a stock fund. The name is only a fallback.
  const text = (custodianClass.trim() === '' ? description : custodianClass).toLowerCase();
  if (/cash|money\s*market|sweep|treasury\s*bill/.test(text)) return { assetClass: 'CASH', bucket: 'NOW' };
  if (/bond|muni|fixed|treasur|debt|credit|aggregate/.test(text)) {
    return { assetClass: 'FIXED_INCOME', bucket: 'SOON' };
  }
  if (/derivative|option|alternative|hedge|buffer|premium\s*income|covered\s*call/.test(text)) {
    return { assetClass: 'ALTERNATIVE', bucket: 'SOON' };
  }
  if (/real\s*estate|reit|commodit|gold|precious|infrastructure/.test(text)) {
    return { assetClass: 'REAL_ASSET', bucket: 'LATER' };
  }
  return { assetClass: 'EQUITY', bucket: 'LATER' };
}

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * The account after importing these holdings: its funds replaced by them (a
 * symbol listed twice is added together), each with the shares it holds, and
 * no model. Its balance is what they add up to; from here on it follows the
 * shares at today's prices (atCurrentPrices). The year's fee is paid from the
 * cash funds among them, which the account card checks.
 */
export function holdingsToAccount(account: Account, holdings: readonly ImportedHolding[]): Account {
  const merged = new Map<string, { amountCents: number; sharesMicros: number | null }>();
  for (const holding of holdings) {
    const earlier = merged.get(holding.symbol);
    merged.set(holding.symbol, {
      amountCents: (earlier?.amountCents ?? 0) + holding.marketValueCents,
      sharesMicros:
        earlier === undefined
          ? holding.sharesMicros
          : earlier.sharesMicros === null || holding.sharesMicros === null
            ? null
            : earlier.sharesMicros + holding.sharesMicros,
    });
  }

  const lines = [...merged].map(
    ([tickerSymbol, { amountCents, sharesMicros }]): AccountLine => ({ tickerSymbol, amountCents, heldSharesMicros: sharesMicros }),
  );
  return {
    ...account,
    balanceCents: lines.reduce((sum, line) => sum + line.amountCents, 0),
    modelId: null,
    lines,
    // Locked shares described the old funds.
    proposalShares: [],
  };
}
