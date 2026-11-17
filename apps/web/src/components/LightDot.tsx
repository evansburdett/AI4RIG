import type { Light } from '../domain/types.js';

const WORDS: Record<Light, string> = { GREEN: 'On track', YELLOW: 'Needs a look', RED: 'Needs action' };

/** A stoplight dot with its word, for a table cell. The full sentence is in the tooltip. */
export function LightDot({ light, title }: { light: Light; title: string }) {
  return (
    <span className={`stoplight stoplight-${light.toLowerCase()} compact`} title={title}>
      <span className="stoplight-dot" aria-hidden="true" />
      <span>{WORDS[light]}</span>
    </span>
  );
}
