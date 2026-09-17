import { LIFE_STAGE_LABELS } from '../domain/lifeStage.js';
import type { ClientSummary } from '../domain/types.js';

interface Props {
  clients: readonly ClientSummary[];
  activeClientNumber: string | null;
  onSelect: (clientNumber: string) => void;
  disabled?: boolean;
}

/**
 * US-03 — move through the book without reloading the application.
 *
 * Clients appear by their generated number, because that is the only identifier
 * this system has. Initials ride along as a display label so an advisor with
 * forty cases can find one, but the value is always the number: initials
 * collide, and a collision in a switcher means opening the wrong client's plan.
 *
 * Switching is a route change, not a page load. The screen you are on stays the
 * screen you are on — an advisor comparing two clients' breakdowns should not
 * be dropped back to the profile form between them.
 */
export function ClientSwitcher({ clients, activeClientNumber, onSelect, disabled = false }: Props) {
  return (
    <div className="switcher">
      <label htmlFor="client-switcher">Client</label>
      <select
        id="client-switcher"
        value={activeClientNumber ?? ''}
        disabled={disabled || clients.length === 0}
        onChange={(event) => onSelect(event.target.value)}
      >
        {activeClientNumber === null && <option value="">Select a client…</option>}
        {clients.map((client) => (
          <option key={client.clientNumber} value={client.clientNumber}>
            {client.clientNumber} — {client.initials} · {LIFE_STAGE_LABELS[client.lifeStage]}
          </option>
        ))}
      </select>
    </div>
  );
}
