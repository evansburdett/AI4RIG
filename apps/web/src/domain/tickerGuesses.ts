/**
 * Best guesses for the funds in RIG's vendor models (Models.xlsx, 10/26), so
 * importing them does not mean classifying 130-odd symbols by hand. Looked up
 * from fund sponsors' and market-data sites in October 2026.
 *
 * These are suggestions only. The import shows each one with its asset class
 * and bucket already chosen, and the advisor can change any of them there or
 * later on the Tickers screen. Once a ticker is in the universe, RIG's own
 * classification wins and these are not consulted again.
 *
 * Buckets follow RIG's money cycle:
 *   Now    cash and money market.
 *   Soon   bonds, plus balanced and income funds and liquid alternatives:
 *          the steadier money for the next several years.
 *   Later  stock funds, for growth.
 *
 * A name is left out where it could not be confirmed; the classification is
 * still clear from the fund family and the models it sits in.
 */

import type { AssetClass, BucketType } from './types.js';

export interface TickerGuess {
  readonly name: string | null;
  readonly assetClass: AssetClass;
  readonly bucket: BucketType;
}

/** What a model's "USD CASH" line becomes: a cash ticker that is always worth $1. */
export const CASH_SYMBOL = 'CASH';

const equity = (name: string | null): TickerGuess => ({ name, assetClass: 'EQUITY', bucket: 'LATER' });
const bond = (name: string | null): TickerGuess => ({ name, assetClass: 'FIXED_INCOME', bucket: 'SOON' });
/** Balanced and income funds: mostly stocks, held for income and steadiness. */
const balanced = (name: string): TickerGuess => ({ name, assetClass: 'EQUITY', bucket: 'SOON' });

export const TICKER_GUESSES: Readonly<Record<string, TickerGuess>> = {
  [CASH_SYMBOL]: { name: 'Cash (USD)', assetClass: 'CASH', bucket: 'NOW' },

  // American Funds (Capital Group) mutual funds, F-2 and F-3 shares.
  AMCFX: equity('American Funds AMCAP Fund F-2'),
  GFFFX: equity('American Funds Growth Fund of America F-2'),
  FINFX: equity('American Funds Fundamental Investors F-2'),
  ICAFX: equity('American Funds Investment Company of America F-2'),
  WMFFX: equity('American Funds Washington Mutual F-2'),
  NEFFX: equity('American Funds New Economy Fund F-2'),
  ANWFX: equity('American Funds New Perspective Fund F-2'),
  NFFFX: equity('American Funds New World Fund F-2'),
  SMCFX: equity('American Funds SMALLCAP World Fund F-2'),
  SFCWX: equity('American Funds SMALLCAP World Fund F-3'),
  AGVGX: equity('American Funds Global Insight Fund F-2'),
  WGIFX: equity('American Funds Capital World Growth and Income F-2'),
  FWGIX: equity('American Funds Capital World Growth and Income F-3'),
  AMRFX: equity('American Funds American Mutual Fund F-2'),
  IGFFX: equity('American Funds International Growth and Income F-2'),
  AMBFX: balanced('American Funds American Balanced Fund F-2'),
  GBLFX: balanced('American Funds Global Balanced Fund F-2'),
  CAIFX: balanced('American Funds Capital Income Builder F-2'),
  AMEFX: balanced('American Funds Income Fund of America F-2'),
  EBNFX: bond('American Funds Emerging Markets Bond Fund F-2'),
  MIAYX: bond('American Funds Multi-Sector Income Fund F-2'),
  AHIFX: bond('American Funds American High-Income Trust F-2'),
  ABNFX: bond('American Funds Bond Fund of America F-2'),
  ANBFX: bond('American Funds Strategic Bond Fund F-2'),
  GVTFX: bond('American Funds U.S. Government Securities Fund F-2'),
  HIMFX: bond('American High-Income Municipal Bond Fund F-3'),

  // Capital Group ETFs.
  CGGO: equity('Capital Group Global Growth Equity ETF'),
  CGDG: equity('Capital Group Dividend Growers ETF'),
  CGGE: equity('Capital Group Global Equity ETF'),
  CGNG: equity('Capital Group New Geography Equity ETF'),
  CGUS: equity('Capital Group Core Equity ETF'),
  CGDV: equity('Capital Group Dividend Value ETF'),
  CGMM: equity('Capital Group U.S. Small and Mid Cap ETF'),
  CGMU: bond('Capital Group Municipal Income ETF'),
  CGHM: bond('Capital Group Municipal High-Income ETF'),

  // Fidelity index funds.
  FXAIX: equity('Fidelity 500 Index Fund'),
  FLCOX: equity('Fidelity Large Cap Value Index Fund'),
  FSPGX: equity('Fidelity Large Cap Growth Index Fund'),
  FNCMX: equity('Fidelity Nasdaq Composite Index Fund'),
  FIMVX: equity('Fidelity Mid Cap Value Index Fund'),
  FSMDX: equity('Fidelity Mid Cap Index Fund'),
  FSSNX: equity('Fidelity Small Cap Index Fund'),
  FSGGX: equity('Fidelity Global ex U.S. Index Fund'),
  FXNAX: bond('Fidelity U.S. Bond Index Fund'),
  FUAMX: bond('Fidelity Intermediate Treasury Bond Index Fund'),

  // Fidelity Advisor funds, Class I and Class Z.
  FTRIX: equity('Fidelity Advisor Mega Cap Stock Fund I'),
  FZALX: equity('Fidelity Advisor Mega Cap Stock Fund Z'),
  FVDNX: equity(null),
  FVDOX: equity(null),
  FSFNX: equity('Fidelity Advisor Focused Stock Fund I'),
  FSFOX: equity('Fidelity Advisor Focused Stock Fund Z'),
  FOTHX: equity('Fidelity Advisor OTC Fund I'),
  FOTJX: equity('Fidelity Advisor OTC Fund Z'),
  FIIMX: equity('Fidelity Advisor Mid Cap II Fund I'),
  FZAMX: equity('Fidelity Advisor Mid Cap II Fund Z'),
  FIVQX: equity('Fidelity Advisor International Value Fund I'),
  FIQKX: equity(null),
  FTEIX: equity('Fidelity Advisor Total International Equity Fund I'),
  FIEZX: equity(null),
  FCBIX: bond('Fidelity Advisor Corporate Bond Fund I'),
  FEPIX: bond('Fidelity Advisor Total Bond Fund I'),
  FBKWX: bond(null),
  FGBPX: bond('Fidelity Advisor Investment Grade Bond Fund I'),
  FCNWX: bond('Fidelity Advisor Conservative Income Bond Fund I'),
  FCNYX: bond('Fidelity Advisor Conservative Income Bond Fund Z'),
  FMSCX: bond('Fidelity Advisor Mortgage Securities Fund I'),

  // First Trust ETFs.
  FTGS: equity('First Trust Growth Strength ETF'),
  FTCS: equity('First Trust Capital Strength ETF'),
  AFLG: equity('First Trust Active Factor Large Cap ETF'),
  FVD: equity('First Trust Value Line Dividend Index Fund'),
  FTA: equity('First Trust Large Cap Value AlphaDEX Fund'),
  FEX: equity('First Trust Large Cap Core AlphaDEX Fund'),
  RDVY: equity('First Trust Rising Dividend Achievers ETF'),
  TDIV: equity('First Trust NASDAQ Technology Dividend Index Fund'),
  QTEC: equity('First Trust NASDAQ-100 Technology Sector Index Fund'),
  FDN: equity('First Trust Dow Jones Internet Index Fund'),
  FTXO: equity('First Trust Nasdaq Bank ETF'),
  FAI: equity('First Trust Bloomberg Artificial Intelligence ETF'),
  FXH: equity('First Trust Health Care AlphaDEX Fund'),
  FXR: equity('First Trust Industrials/Producer Durables AlphaDEX Fund'),
  FDT: equity('First Trust Developed Markets ex-US AlphaDEX Fund'),
  FEP: equity('First Trust Europe AlphaDEX Fund'),
  FJP: equity('First Trust Japan AlphaDEX Fund'),
  FEM: equity('First Trust Emerging Markets AlphaDEX Fund'),
  LALT: { name: 'First Trust Multi-Strategy Alternative ETF', assetClass: 'ALTERNATIVE', bucket: 'SOON' },
  FIXD: bond('First Trust TCW Opportunistic Fixed Income ETF'),
  FTCB: bond('First Trust Core Investment Grade ETF'),
  FIIG: bond('First Trust Intermediate Duration Investment Grade Corporate ETF'),
  FSIG: bond('First Trust Limited Duration Investment Grade Corporate ETF'),
  LGOV: bond('First Trust Long Duration Opportunities ETF'),
  LMBS: bond('First Trust Low Duration Opportunities ETF'),

  // J.P. Morgan funds and ETFs, plus the SPDR sector funds in their models.
  BBUS: equity('JPMorgan BetaBuilders U.S. Equity ETF'),
  JUESX: equity('JPMorgan U.S. Equity Fund I'),
  JUSA: equity('JPMorgan U.S. Research Enhanced Large Cap ETF'),
  SEEGX: equity('JPMorgan Large Cap Growth Fund I'),
  HLQVX: equity(null),
  XLC: equity('Communication Services Select Sector SPDR Fund'),
  XLK: equity('Technology Select Sector SPDR Fund'),
  JIRE: equity('JPMorgan International Research Enhanced Equity ETF'),
  JIG: equity('JPMorgan International Growth ETF'),
  JIVE: equity('JPMorgan International Value ETF'),
  BBJP: equity('JPMorgan BetaBuilders Japan ETF'),
  EMREX: equity(null),
  JEMSX: equity('JPMorgan Emerging Markets Equity Fund I'),
  HLIPX: bond(null),
  JBND: bond('JPMorgan Active Bond ETF'),
  JMSIX: bond(null),
  BBHY: bond('JPMorgan BetaBuilders USD High Yield Corporate Bond ETF'),

  // ESG funds in the Tax-Aware & ESG blend.
  DSI: equity('iShares MSCI KLD 400 Social ETF'),
  ESGU: equity('iShares ESG Aware MSCI USA ETF'),
  LCTU: equity('BlackRock U.S. Carbon Transition Readiness ETF'),
  USXF: equity('iShares ESG Advanced MSCI USA ETF'),
  LCTD: equity('BlackRock World ex U.S. Carbon Transition Readiness ETF'),
  DMXF: equity('iShares ESG Advanced MSCI EAFE ETF'),
  ESGE: equity('iShares ESG Aware MSCI EM ETF'),
  SUSB: bond('iShares ESG Aware 1-5 Year USD Corporate Bond ETF'),
  EAGG: bond('iShares ESG Aware U.S. Aggregate Bond ETF'),
  EUSB: bond('iShares ESG Advanced Total USD Bond Market ETF'),
  SUSC: bond('iShares ESG Aware USD Corporate Bond ETF'),

  // Faith-based model: Eventide and Ave Maria.
  ESUM: equity('Eventide US Market ETF'),
  ELCV: equity('Eventide High Dividend ETF'),
  ETLIX: equity('Eventide Large Cap Focus Fund I'),
  ETIDX: equity('Eventide Dividend Opportunities Fund I'),
  ETILX: equity('Eventide Gilead Fund I'),
  ETIHX: equity('Eventide Healthcare & Life Sciences Fund I'),
  ETIMX: balanced('Eventide Balanced Fund I'),
  ETIBX: bond('Eventide Limited-Term Bond Fund I'),
  ETIRX: bond('Eventide Core Bond Fund I'),
  AVEDX: equity('Ave Maria Rising Dividend Fund'),
  AVERX: equity('Ave Maria Value Focused Fund'),
  AVEAX: equity('Ave Maria Growth Focused Fund'),
  AVEFX: bond('Ave Maria Bond Fund'),
};
