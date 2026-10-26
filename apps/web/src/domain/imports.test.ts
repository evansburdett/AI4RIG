import { describe, expect, it } from 'vitest';

import { toScaledInteger } from './decimal.js';
import { cashForFee, guessFromCustodianClass, holdingsToAccount, readHoldingsSheet } from './importHoldings.js';
import { readModelsSheet } from './importModels.js';
import { newAccount } from './factory.js';

describe('toScaledInteger', () => {
  it('reads spreadsheet numbers exactly, rounding once', () => {
    expect(toScaledInteger('53.0092', 2)).toBe(5301);
    expect(toScaledInteger('109198.952', 2)).toBe(10_919_895);
    expect(toScaledInteger('3.796', 6)).toBe(3_796_000);
    expect(toScaledInteger('0.17125', 6)).toBe(171_250);
    expect(toScaledInteger('4.041e-05', 6)).toBe(40);
    expect(toScaledInteger('1.5E3', 0)).toBe(1500);
    expect(toScaledInteger('$1,234.565', 2)).toBe(123_457);
    expect(toScaledInteger('-2.5', 0)).toBe(-3);
    expect(toScaledInteger('0.004', 2)).toBe(0);
  });

  it('refuses anything that is not a number', () => {
    expect(toScaledInteger('', 2)).toBeNull();
    expect(toScaledInteger('abc', 2)).toBeNull();
    expect(toScaledInteger('1.2.3', 2)).toBeNull();
    expect(toScaledInteger('.', 2)).toBeNull();
  });
});

describe('readModelsSheet', () => {
  it('reads each model name and the funds under it, as basis points', () => {
    const { models, problems } = readModelsSheet([
      ['Growth Model', null],
      ['AMCFX', '0.6'],
      ['gfffx', '0.4'],
      [null, null],
      ['Income Model', null],
      ['ABNFX', '0.98'],
      ['USD CASH', '0.02'],
    ]);
    expect(problems).toEqual([]);
    expect(models).toEqual([
      {
        name: 'Growth Model',
        lines: [
          { tickerSymbol: 'AMCFX', weightBps: 6000 },
          { tickerSymbol: 'GFFFX', weightBps: 4000 },
        ],
        notes: [],
      },
      {
        name: 'Income Model',
        lines: [
          { tickerSymbol: 'ABNFX', weightBps: 9800 },
          { tickerSymbol: 'CASH', weightBps: 200 },
        ],
        notes: [],
      },
    ]);
  });

  it('reads percentages as well as fractions', () => {
    const { models } = readModelsSheet([['M', ''], ['A', '25'], ['B', '75']]);
    expect(models[0]?.lines.map((l) => l.weightBps)).toEqual([2500, 7500]);
  });

  it('rounds weights finer than 0.01% so the model still adds up to 100%', () => {
    const { models } = readModelsSheet([
      ['Blend', null],
      ['A', '0.17125'],
      ['B', '0.05625'],
      ['C', '0.7725'],
    ]);
    const lines = models[0]!.lines;
    expect(lines.reduce((sum, l) => sum + l.weightBps, 0)).toBe(10_000);
    expect(lines.map((l) => l.weightBps)).toEqual([1713, 562, 7725]);
    expect(models[0]?.notes.join(' ')).toMatch(/rounded/);
  });

  it('leaves out a fund at 0%, and keeps one copy of a model listed twice', () => {
    const { models, problems } = readModelsSheet([
      ['Moderate', null],
      ['FTA', '1'],
      ['FEX', '0'],
      ['Moderate', null],
      ['FTA', '1'],
    ]);
    expect(problems).toEqual([]);
    expect(models).toHaveLength(1);
    expect(models[0]?.lines).toEqual([{ tickerSymbol: 'FTA', weightBps: 10_000 }]);
    expect(models[0]?.notes.join(' ')).toMatch(/FEX.*Listed twice/);
  });

  it('stops on a model that does not add up, a bad weight, or a fund with no model', () => {
    const { problems } = readModelsSheet([
      ['VTI', '0.5'],
      ['Short', null],
      ['A', '0.5'],
      ['B', 'lots'],
    ]);
    expect(problems).toEqual([
      'Row 1: VTI has a weight but no model name above it.',
      "Row 4: B's weight \"lots\" in Short is not a number.",
      'Short adds up to 50%, not 100%.',
    ]);
  });

  it('refuses the same name with different funds', () => {
    const { problems } = readModelsSheet([['M', null], ['A', '1'], ['m', null], ['B', '1']]);
    expect(problems[0]).toMatch(/listed twice with different funds/);
  });
});

const HEADER = ['Symbol / CUSIP / ID', 'Description / Fund', 'Asset Class', 'Quantity', 'Price / NAV', 'Market Value', 'Percent of Account Holdings'];

describe('readHoldingsSheet', () => {
  const sample = [
    HEADER,
    ['SPYI', 'Neos S&p 500 High Income Etf', 'Derivative Income', '2060', '53.0092', '109198.952', '0.6'],
    ['MDNLX', 'Blackrock National Mun Investor Cl A', 'Int Muni Bond', '3.796', '9.66', '36.66936', '0.1'],
    ['VXPXX', 'Jpmorgan Tax Free Money Market Premier Cl', 'Cash and Equiv', '93572.35', '1', '93572.35', '0.2'],
    ['9999227', 'Insured Cash Account', 'Cash and Equiv', '13855.01', '1', '13855.01', '0.1'],
    [null, null, null, null, null, null, null],
    ['Total', null, null, null, null, '216662.98', '1'],
  ];

  it('reads each holding exactly, with our asset class and bucket guessed from theirs', () => {
    const file = readHoldingsSheet(sample);
    expect(file.problems).toEqual([]);
    expect(file.warnings).toEqual([]);
    expect(file.holdings.map((h) => [h.symbol, h.sharesMicros, h.priceCents, h.marketValueCents, h.assetClass, h.bucket])).toEqual([
      ['SPYI', 2_060_000_000, 5301, 10_919_895, 'ALTERNATIVE', 'SOON'],
      ['MDNLX', 3_796_000, 966, 3667, 'FIXED_INCOME', 'SOON'],
      ['VXPXX', 93_572_350_000, 100, 9_357_235, 'CASH', 'NOW'],
      ['9999227', 13_855_010_000, 100, 1_385_501, 'CASH', 'NOW'],
    ]);
    expect(file.totalCents).toBe(10_919_895 + 3667 + 9_357_235 + 1_385_501);
  });

  it('flags a market value that quantity times price does not support', () => {
    const file = readHoldingsSheet([HEADER, ['MSFT', 'Microsoft', 'Large US Bl Eq', '42', '531.30', '20000', '1']]);
    expect(file.holdings[0]?.warning).toBe('Quantity × price is $22,314.60, but the market value says $20,000.00.');
  });

  it('works out a missing market value from quantity and price', () => {
    const file = readHoldingsSheet([HEADER, ['MSFT', 'Microsoft', 'Large US Bl Eq', '42', '531.3', '', '']]);
    expect(file.holdings[0]?.marketValueCents).toBe(2_231_460);
  });

  it('warns when the share-of-account column does not reach 100%', () => {
    const file = readHoldingsSheet([HEADER, ['MSFT', 'Microsoft', 'Large US Bl Eq', '1', '100', '100', '0.5']]);
    expect(file.warnings.join(' ')).toMatch(/does not add up to 100%/);
  });

  it('marks a row whose symbol cannot be a ticker, without stopping the rest', () => {
    const file = readHoldingsSheet([HEADER, ['BRK B', 'Berkshire', 'Large US Val Eq', '1', '500', '500', '1']]);
    expect(file.holdings[0]?.problem).toMatch(/cannot be a ticker/);
    expect(file.totalCents).toBe(0);
  });

  it('needs a heading row with a symbol column', () => {
    expect(readHoldingsSheet([['a', 'b'], ['1', '2']]).problems).toEqual(['No heading row with a Symbol column was found.']);
  });
});

describe('guessFromCustodianClass', () => {
  it('maps the custodian classes in RIG\'s sample', () => {
    expect(guessFromCustodianClass('Large US Bl Eq')).toEqual({ assetClass: 'EQUITY', bucket: 'LATER' });
    expect(guessFromCustodianClass('Short Muni Bond')).toEqual({ assetClass: 'FIXED_INCOME', bucket: 'SOON' });
    expect(guessFromCustodianClass('Cash and Equiv')).toEqual({ assetClass: 'CASH', bucket: 'NOW' });
    expect(guessFromCustodianClass('Derivative Income')).toEqual({ assetClass: 'ALTERNATIVE', bucket: 'SOON' });
    expect(guessFromCustodianClass('Emerging Markets Equity')).toEqual({ assetClass: 'EQUITY', bucket: 'LATER' });
  });

  it('goes by the custodian\'s class over a fund name that says "cash"', () => {
    expect(guessFromCustodianClass('Mid Cap US Val Eq', 'Pacer U S Cash Cows 100 Etf')).toEqual({ assetClass: 'EQUITY', bucket: 'LATER' });
    expect(guessFromCustodianClass('', 'Insured Cash Account')).toEqual({ assetClass: 'CASH', bucket: 'NOW' });
  });
});

describe('holdingsToAccount', () => {
  const holdings = readHoldingsSheet([
    HEADER,
    ['VXPXX', 'Money Market', 'Cash and Equiv', '20000', '1', '20000', ''],
    ['MSFT', 'Microsoft', 'Large US Bl Eq', '10', '500', '5000', ''],
    ['MSFT', 'Microsoft', 'Large US Bl Eq', '2.5', '500', '1250', ''],
  ]).holdings;

  it('replaces the funds with the holdings, adding a symbol listed twice together', () => {
    const account = holdingsToAccount(newAccount(), holdings, { setBalance: true, feeCents: 0, feeFrom: null });
    expect(account.balanceCents).toBe(26_250_00);
    expect(account.modelId).toBeNull();
    expect(account.lines).toEqual([
      { tickerSymbol: 'VXPXX', amountCents: 20_000_00, heldSharesMicros: 20_000_000_000 },
      { tickerSymbol: 'MSFT', amountCents: 6_250_00, heldSharesMicros: 12_500_000 },
    ]);
  });

  it('can take the fee cash out of a cash holding, shares and all', () => {
    expect(cashForFee(holdings, 300_00)).toBe('VXPXX');
    expect(cashForFee(holdings, 50_000_00)).toBeNull();

    const account = holdingsToAccount(newAccount(), holdings, { setBalance: true, feeCents: 300_00, feeFrom: 'VXPXX' });
    expect(account.balanceCents).toBe(26_250_00);
    expect(account.lines[0]).toEqual({ tickerSymbol: 'VXPXX', amountCents: 19_700_00, heldSharesMicros: 19_700_000_000 });
  });
});

describe('a long vendor model name', () => {
  it('is read as it is, up to the API limit', () => {
    const long = 'Fidelity Target Allocation Index-Focused 100/0 Model Portfolio & American Funds Growth Model Portfolio';
    expect(readModelsSheet([[long, null], ['A', '1']]).models[0]?.name).toBe(long);
    expect(readModelsSheet([['x'.repeat(201), null], ['A', '1']]).problems[0]).toMatch(/longer than 200/);
  });
});
