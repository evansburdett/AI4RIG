import { BUCKET_LABELS } from '../domain/lifeStage.js';
import type { BucketType } from '../domain/types.js';

/** A bucket's colour and name, inline: which bucket a fund's money counts toward. */
export function BucketTag({ bucket }: { bucket: BucketType }) {
  return (
    <span className="bucket-tag">
      <span className={`swatch bucket-${bucket.toLowerCase()}`} aria-hidden="true" /> {BUCKET_LABELS[bucket]}
    </span>
  );
}
