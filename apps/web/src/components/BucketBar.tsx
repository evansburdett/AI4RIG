import { BUCKET_LABELS } from '../domain/lifeStage.js';
import { formatCentsWhole, formatPercent, percentOf } from '../domain/money.js';
import type { BucketType, Cents } from '../domain/types.js';

export interface BucketSegment {
  readonly bucket: BucketType;
  readonly valueCents: Cents;
}

interface Props {
  segments: readonly BucketSegment[];
  totalCents: Cents;
  /** Money in no bucket yet, such as an account's cash not put in a fund. Drawn as a grey gap. */
  unallocatedCents?: Cents;
}

/** A negative segment is labelled rather than drawn, so it cannot look like zero. */
export function BucketBar({ segments, totalCents, unallocatedCents = 0 }: Props) {
  const drawable = segments.filter((s) => s.valueCents > 0);
  const gap = Math.max(unallocatedCents, 0);
  const drawableTotal = drawable.reduce((sum, s) => sum + s.valueCents, 0) + gap;

  const description = [
    ...segments.map((s) => `${BUCKET_LABELS[s.bucket]} ${formatCentsWhole(s.valueCents)}`),
    ...(gap > 0 ? [`Not in a fund ${formatCentsWhole(gap)}`] : []),
  ].join('. ');

  return (
    <div>
      <div className="bucket-bar-track" role="img" aria-label={description}>
        {drawable.map((segment) => (
          <div
            key={segment.bucket}
            className={`bucket-bar-segment bucket-${segment.bucket.toLowerCase()}`}
            style={{ flexGrow: segment.valueCents / Math.max(drawableTotal, 1) }}
          />
        ))}
        {gap > 0 && (
          <div
            className="bucket-bar-segment bucket-unallocated"
            style={{ flexGrow: gap / Math.max(drawableTotal, 1) }}
          />
        )}
      </div>

      <ul className="bucket-legend">
        {segments.map((segment) => (
          <li key={segment.bucket}>
            <span className={`swatch bucket-${segment.bucket.toLowerCase()}`} aria-hidden="true" />
            <span>{BUCKET_LABELS[segment.bucket]}</span>
            <span className="bucket-legend-value">{formatCentsWhole(segment.valueCents)}</span>
            <span className="muted">
              {segment.valueCents < 0
                ? 'overdrawn'
                : formatPercent(percentOf(segment.valueCents, totalCents))}
            </span>
          </li>
        ))}
        {gap > 0 && (
          <li>
            <span className="swatch bucket-unallocated" aria-hidden="true" />
            <span>Not in a fund</span>
            <span className="bucket-legend-value">{formatCentsWhole(gap)}</span>
            <span className="muted">{formatPercent(percentOf(gap, totalCents))}</span>
          </li>
        )}
      </ul>
    </div>
  );
}
