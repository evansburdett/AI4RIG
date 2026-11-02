import { useEffect, useId, useRef, useState } from 'react';

import {
  accountCash,
  accountHoldings,
  allocatedCents,
  atCurrentPrices,
  cashForFeeCents,
  exactPriceMicros,
  amountForWeight,
  applyModel,
  bucketOf,
  investableCents,
  linesAsWeights,
  matchesModel,
  modelChoices,
  modelsById,
  tickersBySymbol,
  weightBpsOf,
} from '../domain/breakdown.js';
import { ACCOUNT_TYPE_LABELS, TAX_FUNNEL_LABELS } from '../domain/lifeStage.js';
import { toScaledInteger } from '../domain/decimal.js';
import { centsToInput, formatCents, formatPrice, parseCents } from '../domain/money.js';
import { bpsToPercentInput, formatBps, parsePercentToBps } from '../domain/percent.js';
import { isValidSymbol, normalizeSymbol } from '../domain/tickers.js';
import { ACCOUNT_TYPES, BUCKETS, DEFAULT_TAX_FUNNEL, TAX_FUNNELS } from '../domain/types.js';
import type {
  Account,
  AccountLine,
  BucketType,
  ImportRequest,
  ImportResult,
  ModelPortfolio,
  Ticker,
} from '../domain/types.js';
import type { AccountFee } from '../domain/worksheet.js';

import { BucketBar } from './BucketBar.js';
import { BucketTag } from './BucketTag.js';
import { CellInput } from './CellInput.js';
import { ImportHoldings } from './ImportHoldings.js';
import { SelectField, TextField } from './Fields.js';
import { MoneyInput } from './MoneyInput.js';
import { NewTickerFields } from './NewTickerFields.js';
import { formatShares } from './shares.js';

interface Props {
  /** Its place in the case, for the title: "Account 2". */
  number: number;
  /** Just added: scroll to it and put the cursor in its balance. */
  justAdded?: boolean;
  account: Account;
  /** This account's advisory fee (US-19), held in the account as cash. */
  fee: AccountFee | undefined;
  models: readonly ModelPortfolio[];
  tickers: readonly Ticker[];
  onChange: (next: Account) => void;
  onRemove: () => void;
  /** Saves this account's funds as a reusable model. Resolves to the saved model. */
  onSaveAsModel: (model: ModelPortfolio) => Promise<ModelPortfolio>;
  /** Adds a symbol typed as a new fund to the universe (US-24). */
  onAddTicker: (ticker: Ticker) => Promise<Ticker>;
  /** Saves the tickers and prices a holdings import needs. */
  onImport: (request: ImportRequest) => Promise<ImportResult>;
  /** This account's advisory fee if its balance were this, for a holdings import. */
  feeFor: (balanceCents: number) => number;
}

/** Dollars typed in a fund: never negative. */
function parseDollars(text: string): number | null {
  const cents = parseCents(text);
  return cents === null || cents < 0 ? null : cents;
}

/**
 * One account, the way RIG allocates (10/26): type the balance, and a year of
 * its advisory fee is held back as cash. The rest is the amount to invest,
 * filled from a model, imported from a statement, or picked by hand. Every fund
 * then works the same way, and any of its weight, dollars, or shares can be
 * typed, with the others following at today's price. Dollars and weight move
 * money inside the balance, and the footer shows what is left to allocate.
 * Shares are what the client owns, so the balance follows them. Every fund
 * counts toward its ticker's bucket.
 */
export function AccountCard({
  number,
  justAdded = false,
  account,
  fee,
  models,
  tickers,
  onChange,
  onRemove,
  onSaveAsModel,
  onAddTicker,
  onImport,
  feeFor,
}: Props) {
  const root = useRef<HTMLDivElement>(null);

  // Add account puts the new one at the bottom of a long page; take the
  // advisor there, ready to type the balance. Only on mount: the key is the
  // account id, so this runs once for the new account.
  useEffect(() => {
    if (!justAdded || root.current === null) return;
    // Focus first: focusing during a smooth scroll stops it where it is.
    root.current.querySelector<HTMLInputElement>('.money-input input')?.focus({ preventScroll: true });
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const feeCents = fee?.feeCents ?? 0;
  const investable = investableCents(account, feeCents);
  const allocated = allocatedCents(account);
  const tickerMap = tickersBySymbol(tickers);
  const { feeCashCents, roundingCents, leftCents: left } = accountCash(account, tickerMap, feeCents);
  const byId = modelsById(models);
  const model = account.modelId === null ? undefined : byId.get(account.modelId);
  const adjusted = model !== undefined && !matchesModel(account, model, feeCents, tickerMap);
  // Buckets come from the funds chosen, never typed: the fee cash in Now,
  // then each fund in its ticker's bucket.
  const holdings = accountHoldings(account, tickerMap, feeCents);
  const segments = BUCKETS.map((bucket) => ({
    bucket,
    valueCents: holdings.filter((h) => h.bucket === bucket).reduce((sum, h) => sum + h.marketValueCents, 0),
  }));
  const unpriced = account.lines.filter((l) => exactPriceMicros(tickerMap.get(l.tickerSymbol)) === null);
  const feeCovered = cashForFeeCents(account, tickerMap);

  function patch(changes: Partial<Account>) {
    // Every edit goes through the one rule for what a change to a fund means.
    onChange(atCurrentPrices({ ...account, ...changes }, tickerMap));
  }

  /** The client bought or sold (RIG, 10/26), so the balance follows the shares. */
  function setShares(symbol: string, sharesMicros: number) {
    patch({ lines: account.lines.map((l) => (l.tickerSymbol === symbol ? { ...l, sharesMicros } : l)) });
  }

  /** Dollars or a weight place money inside the balance: they become shares at today's price. */
  function setLine(symbol: string, amountCents: number) {
    patch({
      lines: account.lines.map((l) => (l.tickerSymbol === symbol ? { ...l, amountCents, sharesMicros: null } : l)),
    });
  }

  /** Funds of the advisor's own that a fill would replace: anything but the model as filled. */
  function wouldReplaceOwnFunds(): boolean {
    if (account.lines.length === 0) return false;
    return model === undefined || adjusted;
  }

  function fillFrom(next: ModelPortfolio) {
    if (wouldReplaceOwnFunds() && !window.confirm(`Replace this account's funds and share counts with "${next.name}"?`)) return;
    onChange(applyModel(account, next, feeCents));
  }

  function chooseModel(id: string) {
    if (id === '') {
      // Keeps the funds; they are just no longer tied to a model.
      patch({ modelId: null });
      return;
    }
    const next = byId.get(id);
    if (next !== undefined) fillFrom(next);
  }

  return (
    <div className="account" ref={root}>
      <div className="account-title">
        <h4>
          Account {number}: {ACCOUNT_TYPE_LABELS[account.accountType]}
          {account.maskedNumber === '' ? '' : ` ····${account.maskedNumber}`}{' '}
          <span className="tag">{TAX_FUNNEL_LABELS[account.taxFunnel]}</span>
        </h4>
        <strong className="amount">{formatCents(account.balanceCents)}</strong>
      </div>

      <div className="account-head">
        <SelectField
          label="Account type"
          value={account.accountType}
          options={ACCOUNT_TYPES}
          labels={ACCOUNT_TYPE_LABELS}
          // A new type brings its usual funnel; the advisor can still change it.
          onChange={(accountType) => patch({ accountType, taxFunnel: DEFAULT_TAX_FUNNEL[accountType] })}
        />
        <SelectField
          label="Tax funnel"
          value={account.taxFunnel}
          options={TAX_FUNNELS}
          labels={TAX_FUNNEL_LABELS}
          onChange={(taxFunnel) => patch({ taxFunnel })}
        />
        <TextField
          label="Masked number"
          value={account.maskedNumber}
          placeholder="Last four"
          onChange={(maskedNumber) => patch({ maskedNumber })}
        />
        <MoneyInput
          label="Account balance"
          valueCents={account.balanceCents}
          hint="Funds at today's prices plus cash. Typing it sets the cash."
          onChange={(balanceCents) => patch({ balanceCents })}
        />
        <div className="field">
          <button type="button" className="danger" onClick={onRemove}>
            Remove account
          </button>
        </div>
      </div>

      <p className="account-math">
        <span>
          Balance <strong>{formatCents(account.balanceCents)}</strong>
        </span>
        <span aria-hidden="true">−</span>
        <span>
          Fee cash <strong>{formatCents(feeCashCents)}</strong>
          {fee !== undefined && fee.rateBps > 0 && <span className="muted"> ({formatBps(fee.rateBps)})</span>}
        </span>
        <span aria-hidden="true">=</span>
        <span>
          To invest <strong>{formatCents(investable)}</strong>
        </span>
      </p>

      {feeCashCents < feeCents && (
        <p className="account-math">
          <span>
            Rest of the {formatCents(feeCents)} fee from cash funds:{' '}
            {feeCovered >= feeCents ? (
              <span className="muted">{formatCents(feeCovered)} in cash covers it</span>
            ) : (
              <span className="text-warn">
                {formatCents(feeCovered)} in cash, {formatCents(feeCents - feeCovered)} short
              </span>
            )}
          </span>
        </p>
      )}

      {account.balanceCents > 0 && (
        <div className="account-buckets">
          <BucketBar segments={segments} totalCents={account.balanceCents} unallocatedCents={left} />
        </div>
      )}

      <div className="account-model">
        <label>
          Model{' '}
          <select
            value={account.modelId ?? ''}
            title={model?.name}
            onChange={(event) => chooseModel(event.target.value)}
          >
            <option value="">No model (pick funds yourself)</option>
            {account.modelId !== null && model === undefined && (
              <option value={account.modelId}>(deleted model)</option>
            )}
            {modelChoices(models, account.taxFunnel).map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.name}
                {choice.taxFunnel !== null && choice.taxFunnel !== account.taxFunnel
                  ? ` (for ${TAX_FUNNEL_LABELS[choice.taxFunnel].toLowerCase()})`
                  : ''}
              </option>
            ))}
          </select>
        </label>
        {adjusted && (
          <>
            <span className="tag" title="The funds no longer match the model, from an edit or from prices moving">
              differs from model
            </span>
            <button type="button" className="link" onClick={() => fillFrom(model)}>
              Refill from model
            </button>
          </>
        )}
      </div>

      <table className="funds">
        <caption className="visually-hidden">Funds in this account</caption>
        <thead>
          <tr>
            <th scope="col">Fund</th>
            <th scope="col">Bucket</th>
            <th scope="col" className="amount">
              Weight
            </th>
            <th scope="col" className="amount">
              Dollars
            </th>
            <th scope="col" className="amount">
              Price
            </th>
            <th scope="col" className="amount">
              Shares
            </th>
            <th scope="col" className="row-actions">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {feeCashCents + roundingCents > 0 && (
            <tr className="fee-cash">
              <th scope="row">Cash</th>
              <td>
                <BucketTag bucket="NOW" />
              </td>
              <td className="amount muted">fee</td>
              <td className="amount">{formatCents(feeCashCents + roundingCents)}</td>
              <td colSpan={3} className="muted">
                {feeCashCents > 0 ? 'One year of the advisory fee' : ''}
                {feeCashCents > 0 && roundingCents > 0 ? ', plus ' : ''}
                {roundingCents > 0 ? `${formatCents(roundingCents)} left after whole shares` : ''}
              </td>
            </tr>
          )}
          {account.lines.map((line) => (
            <FundRow
              key={line.tickerSymbol}
              line={line}
              investable={investable}
              bucket={bucketOf(line.tickerSymbol, tickerMap)}
              name={tickerMap.get(line.tickerSymbol)?.name ?? null}
              priceMicros={exactPriceMicros(tickerMap.get(line.tickerSymbol))}
              onAmount={(cents) => setLine(line.tickerSymbol, cents)}
              onShares={(micros) => setShares(line.tickerSymbol, micros)}
              onRemove={() => patch({ lines: account.lines.filter((l) => l.tickerSymbol !== line.tickerSymbol) })}
            />
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={2}>
              In funds
            </th>
            <td className="amount">{formatBps(weightBpsOf(allocated, investable))}</td>
            <td className="amount">{formatCents(allocated)}</td>
            <td colSpan={3}>
              {account.balanceCents === 0 ? null : left === 0 ? (
                <span className="muted">All invested</span>
              ) : left > 0 ? (
                <span className="text-warn">
                  <strong>{formatCents(left)}</strong> left to allocate
                </span>
              ) : (
                <span className="text-warn">
                  <strong>{formatCents(-left)}</strong> over the balance
                </span>
              )}
            </td>
          </tr>
        </tfoot>
      </table>

      {unpriced.length > 0 && (
        <p className="text-warn">
          No price yet for {unpriced.map((l) => l.tickerSymbol).join(', ')}. Refresh prices, or type{' '}
          {unpriced.length === 1 ? 'one' : 'them'} on the Tickers screen, to turn dollars into shares.
        </p>
      )}

      <ImportHoldings
        account={account}
        tickers={tickers}
        feeFor={feeFor}
        onImport={onImport}
        onApply={onChange}
      />

      <AddFund
        tickers={tickers}
        held={account.lines.map((l) => l.tickerSymbol)}
        onAddTicker={onAddTicker}
        onAdd={(tickerSymbol) => patch({ lines: [...account.lines, { tickerSymbol, amountCents: 0, sharesMicros: null }] })}
      />

      {/* Worth offering only for funds of the advisor's own, not a model as filled. */}
      {(model === undefined || adjusted) && (
        <SaveAsModel
          account={account}
          onSaveAsModel={onSaveAsModel}
          onSaved={(saved) => patch({ modelId: saved.id })}
        />
      )}
    </div>
  );
}

function FundRow({
  line,
  investable,
  bucket,
  name,
  priceMicros,
  onAmount,
  onShares,
  onRemove,
}: {
  line: AccountLine;
  investable: number;
  bucket: BucketType;
  name: string | null;
  priceMicros: number | null;
  onAmount: (cents: number) => void;
  onShares: (micros: number) => void;
  onRemove: () => void;
}) {
  const symbol = line.tickerSymbol;
  return (
    <tr>
      <th scope="row" className="fund-symbol">
        <code>{symbol}</code>
        {name !== null && (
          <span className="fund-name" title={name}>
            {name}
          </span>
        )}
      </th>
      <td>
        <BucketTag bucket={bucket} />
      </td>
      <td className="amount">
        <CellInput
          label={`${symbol} weight`}
          text={bpsToPercentInput(weightBpsOf(line.amountCents, investable))}
          parse={parsePercentToBps}
          onChange={(bps) => onAmount(amountForWeight(bps, investable))}
          suffix="%"
        />
      </td>
      <td className="amount">
        <CellInput
          label={`${symbol} dollars`}
          text={centsToInput(line.amountCents)}
          parse={parseDollars}
          onChange={onAmount}
          prefix="$"
          money
        />
      </td>
      <td className="amount">{priceMicros === null ? <span className="muted">No price</span> : formatPrice(priceMicros)}</td>
      <td className="amount" title="Shares the client owns. Change it when they buy or sell, and the balance follows.">
        <CellInput
          label={`${symbol} shares`}
          text={line.sharesMicros === null ? '' : formatShares(line.sharesMicros)}
          parse={(text) => {
            const micros = toScaledInteger(text, 6);
            return micros === null || micros < 0 ? null : micros;
          }}
          onChange={onShares}
          money
        />
      </td>
      <td className="row-actions">
        <button type="button" className="link" onClick={onRemove}>
          Remove
        </button>
      </td>
    </tr>
  );
}

/**
 * Adds a fund by symbol. One the universe does not have yet can be added on
 * the spot (US-24); it starts in Later, the usual home for a new fund.
 */
function AddFund({
  tickers,
  held,
  onAdd,
  onAddTicker,
}: {
  tickers: readonly Ticker[];
  held: readonly string[];
  onAdd: (symbol: string) => void;
  onAddTicker: (ticker: Ticker) => Promise<Ticker>;
}) {
  const listId = useId();
  const [text, setText] = useState('');
  const symbol = normalizeSymbol(text);
  const known = tickers.some((t) => t.symbol === symbol);
  const already = held.includes(symbol);
  const canAdd = known && !already;

  function add(added: string) {
    onAdd(added);
    setText('');
  }

  return (
    <div className="add-fund">
      <div className="button-row">
        <input
          className="symbol-input"
          type="text"
          aria-label="Fund to add"
          placeholder="Ticker"
          list={listId}
          autoComplete="off"
          spellCheck={false}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && canAdd) add(symbol);
          }}
        />
        <button type="button" disabled={!canAdd} onClick={() => add(symbol)}>
          Add fund
        </button>
        {already && <span className="muted">{symbol} is already in this account.</span>}
      </div>
      {symbol !== '' && !known &&
        (isValidSymbol(symbol) ? (
          <NewTickerFields
            key={symbol}
            symbol={symbol}
            suggestedBucket="LATER"
            onAdd={onAddTicker}
            onAdded={(added) => add(added.symbol)}
          />
        ) : (
          <p className="field-error">Symbols are letters, digits, dots, and dashes, up to 10.</p>
        ))}
      <datalist id={listId}>
        {tickers.map((t) => (
          <option key={t.symbol} value={t.symbol} />
        ))}
      </datalist>
    </div>
  );
}

/** Saves the account's funds, as weights of what is in them, as a model for other accounts. */
function SaveAsModel({
  account,
  onSaveAsModel,
  onSaved,
}: {
  account: Account;
  onSaveAsModel: (model: ModelPortfolio) => Promise<ModelPortfolio>;
  onSaved: (model: ModelPortfolio) => void;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lines = linesAsWeights(account.lines);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const saved = await onSaveAsModel({ id: '', name: name.trim(), taxFunnel: account.taxFunnel, lines });
      onSaved(saved);
      setName('');
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  if (lines.length === 0) return null;

  return (
    <>
      <div className="button-row save-as-model">
        <input
          type="text"
          aria-label="Name for a model from these funds"
          placeholder="Name to reuse these funds as a model"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="button" disabled={name.trim() === '' || busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save as a model'}
        </button>
      </div>
      {error !== null && <p className="field-error">{error}</p>}
    </>
  );
}

