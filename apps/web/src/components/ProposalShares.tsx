import { Callout } from './Callout.js';
import { About } from './Help.js';
import { ACCOUNT_TYPE_LABELS, BUCKET_LABELS } from '../domain/lifeStage.js';
import { formatDateTime } from '../domain/dates.js';
import { formatCents } from '../domain/money.js';
import {
  lockedMatchesPlan,
  proposedPositions,
  lockProposal,
  missingPrices,
  totalOf,
  unlockProposal,
  valueLockedShares,
} from '../domain/proposal.js';
import type { ClientCase, ModelPortfolio, Ticker } from '../domain/types.js';

interface Props {
  clientCase: ClientCase;
  models: readonly ModelPortfolio[];
  tickers: readonly Ticker[];
  onChange: (next: ClientCase) => void;
}

/**
 * US-21: lock the proposal in as whole share counts, and when the client
 * comes back, see the same shares at today's prices. Locking changes the
 * working copy like any other edit; Save case keeps it.
 */
export function ProposalShares({ clientCase, models, tickers, onChange }: Props) {
  const missing = missingPrices(clientCase, models, tickers);
  const anyHoldings = clientCase.accounts.some((a) => proposedPositions(a, models, tickers).length > 0);
  const locked = clientCase.proposalLockedAt !== null;
  const matches = lockedMatchesPlan(clientCase, models, tickers);
  const valuations = valueLockedShares(clientCase, tickers);
  const lockedTotal = totalOf(valuations.map((v) => v.lockedValueCents));
  const currentTotal = totalOf(valuations.map((v) => v.currentValueCents));
  const unpriced = valuations.filter((v) => v.currentPriceCents === null).length;

  function accountLabel(accountId: string): string {
    const account = clientCase.accounts.find((a) => a.id === accountId);
    if (account === undefined) return '';
    return `${ACCOUNT_TYPE_LABELS[account.accountType]}${account.maskedNumber === '' ? '' : ` ····${account.maskedNumber}`}`;
  }

  return (
    <section className="card">
      <div className="card-head">
        <h3>Proposal in shares</h3>
        <div className="button-row">
          <button
            type="button"
            className="primary"
            disabled={missing.length > 0 || !anyHoldings || (locked && matches)}
            onClick={() => onChange(lockProposal(clientCase, models, tickers, new Date()))}
          >
            {locked ? 'Lock in again' : 'Lock in proposal'}
          </button>
          {locked && (
            <button type="button" className="link" onClick={() => onChange(unlockProposal(clientCase))}>
              Clear locked shares
            </button>
          )}
        </div>
      </div>
      <p className="muted">Save the share counts above so they can be revalued at later prices.</p>
      <About title="How locking works">
        <p>
          Each holding&rsquo;s dollars become whole shares at the ticker&rsquo;s price, with the
          remainder kept as cash. Locking keeps those share counts with the case, so when the client
          comes back the same shares are valued at the prices on the Tickers screen without
          retyping anything.
        </p>
      </About>

      {missing.length > 0 && (
        <Callout tone="warning" title="Some tickers have no price">
          Enter a price for {missing.join(', ')} on the Tickers screen to work out shares and lock
          the proposal in.
        </Callout>
      )}

      {!locked ? (
        <p className="empty">Not locked in yet. Lock in once the holdings above are what you are proposing.</p>
      ) : (
        <>
          <p>
            Locked in {formatDateTime(clientCase.proposalLockedAt ?? '')}.{' '}
            {matches ? (
              <span className="muted">The plan still works out to these shares.</span>
            ) : (
              <span className="text-warn">The plan has changed since. Lock in again to update the shares.</span>
            )}
          </p>

          <table>
            <thead>
              <tr>
                <th scope="col">Account</th>
                <th scope="col">Bucket</th>
                <th scope="col">Symbol</th>
                <th scope="col" className="amount">Shares</th>
                <th scope="col" className="amount">Price when locked</th>
                <th scope="col" className="amount">Value when locked</th>
                <th scope="col" className="amount">Price now</th>
                <th scope="col" className="amount">Value now</th>
              </tr>
            </thead>
            <tbody>
              {valuations.map((v) => (
                <tr key={`${v.accountId}:${v.bucket}:${v.tickerSymbol}`}>
                  <td>{accountLabel(v.accountId)}</td>
                  <td>{BUCKET_LABELS[v.bucket]}</td>
                  <th scope="row">
                    <code>{v.tickerSymbol}</code>
                  </th>
                  <td className="amount">{v.shares.toLocaleString('en-US')}</td>
                  <td className="amount">{formatCents(v.lockedPriceCents)}</td>
                  <td className="amount">{formatCents(v.lockedValueCents)}</td>
                  <td className="amount">{v.currentPriceCents === null ? '—' : formatCents(v.currentPriceCents)}</td>
                  <td className="amount">{v.currentValueCents === null ? '—' : formatCents(v.currentValueCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={5}>
                  Total in shares
                </th>
                <td className="amount">{formatCents(lockedTotal)}</td>
                <td />
                <td className="amount">{formatCents(currentTotal)}</td>
              </tr>
            </tfoot>
          </table>
          {unpriced > 0 && (
            <p className="field-hint">
              {unpriced} position{unpriced === 1 ? ' has' : 's have'} no price now and {unpriced === 1 ? 'is' : 'are'} left
              out of today&rsquo;s total.
            </p>
          )}
        </>
      )}
    </section>
  );
}
