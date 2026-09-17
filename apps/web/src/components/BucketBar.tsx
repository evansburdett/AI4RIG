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
}

/**
 * Now / Soon / Later as one bar.
 *
 * A negative segment means the plan asks for more than the client has, and the
 * bar cannot draw that. It shows the overdrawn amount as a labelled warning
 * instead of clamping to zero, because clamping would render an overfunded plan
 * and a perfectly funded one identically.
 */
export function BucketBar({ segments, totalCents }: Props) {
  const drawable = segments.filter((s) => s.valueCents > 0);
  const drawableTotal = drawable.reduce((sum, s) => sum + s.valueCents, 0);

  return (
    <div className="bucket-bar">
      <div className="bucket-bar-track" role="img" aria-label={describe(segments, totalCents)}>
        {drawable.map((segment) => (
          <div
            key={segment.bucket}
            className={`bucket-bar-segment bucket-${segment.bucket.toLowerCase()}`}
            style={{ flexGrow: segment.valueCents / Math.max(drawableTotal, 1) }}
          />
        ))}
      </div>

      <ul className="bucket-legend">
        {segments.map((segment) => (
          <li key={segment.bucket}>
            <span className={`swatch bucket-${segment.bucket.toLowerCase()}`} aria-hidden="true" />
            <span className="bucket-legend-label">{BUCKET_LABELS[segment.bucket]}</span>
            <span className="bucket-legend-value">{formatCentsWhole(segment.valueCents)}</span>
            <span className="muted">
              {segment.valueCents < 0
                ? 'overdrawn'
                : formatPercent(percentOf(segment.valueCents, totalCents))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function describe(segments: readonly BucketSegment[], totalCents: Cents): string {
  return segments
    .map(
      (s) =>
        `${BUCKET_LABELS[s.bucket]} ${formatCentsWhole(s.valueCents)}, ` +
        `${formatPercent(percentOf(s.valueCents, totalCents))}`,
    )
    .join('. ');
}
