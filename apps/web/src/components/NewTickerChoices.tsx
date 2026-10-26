import { ASSET_CLASS_LABELS, BUCKET_LABELS } from '../domain/lifeStage.js';
import { ASSET_CLASSES, BUCKETS } from '../domain/types.js';
import type { AssetClass, BucketType } from '../domain/types.js';

export interface NewTickerChoice {
  readonly symbol: string;
  readonly name: string | null;
  readonly assetClass: AssetClass;
  readonly bucket: BucketType;
  /** Where the suggestion came from, shown so the advisor knows how far to trust it. */
  readonly source: string;
}

/**
 * Symbols an import would add to the universe (US-24, in bulk): each with an
 * asset class and default bucket already suggested, either of which the
 * advisor can change before importing. These decide where the fund's money
 * counts for every case and model, so they are shown rather than assumed.
 */
export function NewTickerChoices({
  choices,
  onChange,
}: {
  choices: readonly NewTickerChoice[];
  onChange: (symbol: string, changes: Partial<Pick<NewTickerChoice, 'assetClass' | 'bucket'>>) => void;
}) {
  if (choices.length === 0) return null;
  return (
    <table className="import-table">
      <caption>
        {choices.length} new ticker{choices.length === 1 ? '' : 's'}: check the asset class and bucket
      </caption>
      <thead>
        <tr>
          <th scope="col">Symbol</th>
          <th scope="col">Name</th>
          <th scope="col">Asset class</th>
          <th scope="col">Bucket</th>
          <th scope="col">Suggested by</th>
        </tr>
      </thead>
      <tbody>
        {choices.map((choice) => (
          <tr key={choice.symbol}>
            <th scope="row">
              <code>{choice.symbol}</code>
            </th>
            <td className="import-name">{choice.name ?? <span className="muted">Unknown</span>}</td>
            <td>
              <select
                aria-label={`${choice.symbol} asset class`}
                value={choice.assetClass}
                onChange={(event) => onChange(choice.symbol, { assetClass: event.target.value as AssetClass })}
              >
                {ASSET_CLASSES.map((assetClass) => (
                  <option key={assetClass} value={assetClass}>
                    {ASSET_CLASS_LABELS[assetClass]}
                  </option>
                ))}
              </select>
            </td>
            <td>
              <select
                aria-label={`${choice.symbol} bucket`}
                value={choice.bucket}
                onChange={(event) => onChange(choice.symbol, { bucket: event.target.value as BucketType })}
              >
                {BUCKETS.map((bucket) => (
                  <option key={bucket} value={bucket}>
                    {BUCKET_LABELS[bucket]}
                  </option>
                ))}
              </select>
            </td>
            <td className="muted">{choice.source}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
