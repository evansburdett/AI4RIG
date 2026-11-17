import type { Light } from '../domain/types.js';

const WORDS: Record<Light, string> = { GREEN: 'On track', YELLOW: 'Needs a look', RED: 'Needs action' };

/**
 * A green, yellow, or red light with its sentence beside it. The words carry
 * the meaning too, so it reads the same printed in black and white.
 */
export function Stoplight({ light, message, compact = false }: { light: Light; message: string; compact?: boolean }) {
  return (
    <span className={`stoplight stoplight-${light.toLowerCase()}${compact ? ' compact' : ''}`} role="status">
      <span className="stoplight-dot" aria-hidden="true" />
      <span>
        <strong>{WORDS[light]}.</strong> {message}
      </span>
    </span>
  );
}
