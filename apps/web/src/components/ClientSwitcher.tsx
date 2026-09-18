import { LIFE_STAGE_LABELS } from '../domain/lifeStage.js';
import type { ClientSummary } from '../domain/types.js';

interface Props {
  clients: readonly ClientSummary[];
  activeClientNumber: string | null;
  onSelect: (clientNumber: string) => void;
  disabled?: boolean;
}

/**
 * US-03. Clients are listed by their generated number; initials are a display
 * label only, since initials collide.
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
            {client.clientNumber}
            {client.initials === '' ? '' : ` — ${client.initials}`} ·{' '}
            {LIFE_STAGE_LABELS[client.lifeStage]}
          </option>
        ))}
      </select>
    </div>
  );
}
