import { useMemo, useState } from 'react';

import { formatDateTime } from '../domain/dates.js';
import { LIFE_STAGE_LABELS } from '../domain/lifeStage.js';
import type { ClientSummary } from '../domain/types.js';
import { hrefFor } from '../routing.js';

interface Props {
  clients: readonly ClientSummary[];
  /** Opens a case, asking first if the open one has unsaved changes. */
  onOpen: (clientNumber: string) => void;
  onNewClient: () => void;
  busy: boolean;
}

/** Lowercase, without the dots and spaces in initials like "A.B.", so "ab" finds them. */
function plain(text: string): string {
  return text.toLowerCase().replace(/[\s.]/g, '');
}

/** Clients whose number or initials contain what was typed. Everyone when nothing is. */
export function filterClients(clients: readonly ClientSummary[], query: string): ClientSummary[] {
  const wanted = plain(query);
  if (wanted === '') return [...clients];
  return clients.filter((c) => plain(c.clientNumber).includes(wanted) || plain(c.initials).includes(wanted));
}

/**
 * Home (RIG, 11/17): every client in a list with a search box, so a client is
 * found by typing their number ("1042") rather than scrolling a long menu. It
 * shows no one's figures, so it is safe to leave on screen between meetings.
 */
export function Home({ clients, onOpen, onNewClient, busy }: Props) {
  const [query, setQuery] = useState('');
  const shown = useMemo(
    () => filterClients(clients, query).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [clients, query],
  );

  function openFirst() {
    const first = shown[0];
    if (first !== undefined) onOpen(first.clientNumber);
  }

  return (
    <div>
      <header className="screen-header">
        <h2>Clients</h2>
        <p className="muted">
          {clients.length} {clients.length === 1 ? 'case' : 'cases'} on this computer
        </p>
      </header>

      <section className="card">
        <div className="home-search">
          <input
            type="search"
            aria-label="Find a client by number or initials"
            placeholder="Client number or initials"
            autoFocus
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') openFirst();
            }}
          />
          <button type="button" onClick={onNewClient} disabled={busy}>
            New client
          </button>
        </div>

        {clients.length === 0 ? (
          <p className="empty">No client cases yet. Use New client to create one.</p>
        ) : shown.length === 0 ? (
          <p className="empty">No client matches &ldquo;{query.trim()}&rdquo;.</p>
        ) : (
          <table className="home-clients">
            <thead>
              <tr>
                <th scope="col">Client</th>
                <th scope="col">Initials</th>
                <th scope="col">Life stage</th>
                <th scope="col">Last changed</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((client) => (
                <tr key={client.clientNumber}>
                  <th scope="row">
                    <a
                      href={hrefFor({ screen: 'profile', clientNumber: client.clientNumber })}
                      onClick={(event) => {
                        event.preventDefault();
                        onOpen(client.clientNumber);
                      }}
                    >
                      {client.clientNumber}
                    </a>
                  </th>
                  <td>{client.initials === '' ? <span className="muted">None</span> : client.initials}</td>
                  <td>{LIFE_STAGE_LABELS[client.lifeStage]}</td>
                  <td className="muted">{formatDateTime(client.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
