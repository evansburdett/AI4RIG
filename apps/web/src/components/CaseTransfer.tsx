import { useRef, useState } from 'react';

import { api } from '../api.js';
import { download } from '../download.js';
import type { CaseTransferFile, ImportCasesResult, ImportChoice } from '../domain/types.js';

import { Callout } from './Callout.js';

const CHOICE_LABELS: Record<ImportChoice, string> = {
  REPLACE: 'Replace it with the file’s',
  SKIP: 'Keep the one here',
  COPY: 'Keep both (the file’s gets a new number)',
};

interface Pending {
  file: CaseTransferFile;
  fileName: string;
  added: readonly string[];
  conflicts: readonly string[];
  choices: Record<string, ImportChoice>;
}

/**
 * Moving cases between computers (RIG, 11/2). Each computer has its own
 * cases, so one advisor exports a file and another imports it. Importing
 * merges: cases with new numbers are added, and for a number already here the
 * advisor picks what happens. The database is backed up first.
 */
export function CaseTransfer({ onImported }: { onImported: () => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function exportAll() {
    setError(null);
    setDone(null);
    try {
      const file = await api.exportCases();
      download(`ai4rig-cases-${file.exportedAt.slice(0, 10)}.json`, JSON.stringify(file, null, 2), 'application/json');
      setDone(`Exported ${file.cases.length} case${file.cases.length === 1 ? '' : 's'}.`);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function open(chosen: File) {
    setError(null);
    setDone(null);
    try {
      const file = JSON.parse(await chosen.text()) as CaseTransferFile;
      const preview = await api.importCases({ file, choices: {}, dryRun: true });
      setPending({
        file,
        fileName: chosen.name,
        added: preview.added,
        conflicts: preview.conflicts,
        // Replace by default (RIG, 11/17): a file sent over is usually the newer copy.
        choices: Object.fromEntries(preview.conflicts.map((n) => [n, 'REPLACE' as ImportChoice])),
      });
    } catch (caught: unknown) {
      setError(caught instanceof SyntaxError ? 'That file is not an AI4RIG cases file.' : String(caught instanceof Error ? caught.message : caught));
    }
  }

  async function confirm() {
    if (pending === null) return;
    setBusy(true);
    setError(null);
    try {
      const result: ImportCasesResult = await api.importCases({
        file: pending.file,
        choices: pending.choices,
        dryRun: false,
      });
      await onImported();
      const copies = Object.entries(result.copied).map(([from, to]) => `${from} as ${to}`);
      setDone(
        [
          result.added.length > 0 ? `Added ${result.added.join(', ')}.` : '',
          result.replaced.length > 0 ? `Replaced ${result.replaced.join(', ')}.` : '',
          copies.length > 0 ? `Copied ${copies.join(', ')}.` : '',
          result.skipped.length > 0 ? `Kept this computer's ${result.skipped.join(', ')}.` : '',
          result.backupPath !== null ? `A backup from before the import is at ${result.backupPath}.` : '',
        ]
          .filter(Boolean)
          .join(' '),
      );
      setPending(null);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h3>Move cases between computers</h3>
      <p className="muted">
        Export saves every case and its reports to a file. Import adds them to the cases on this computer.
      </p>
      <div className="button-row">
        <button type="button" onClick={() => void exportAll()}>
          Export cases
        </button>
        <button type="button" onClick={() => input.current?.click()}>
          Import cases…
        </button>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            event.target.value = '';
            if (chosen !== undefined) void open(chosen);
          }}
        />
      </div>

      {error !== null && <p className="field-error">{error}</p>}
      {done !== null && <Callout tone="info" title="Done">{done}</Callout>}

      {pending !== null && (
        <div className="transfer-preview">
          <p>
            <strong>{pending.fileName}</strong>: {pending.added.length} new case
            {pending.added.length === 1 ? '' : 's'}
            {pending.added.length > 0 ? ` (${pending.added.join(', ')})` : ''}
            {pending.conflicts.length > 0
              ? `, and ${pending.conflicts.length} with a number already on this computer.`
              : '.'}
          </p>
          {pending.conflicts.map((number) => (
            <div key={number} className="field">
              <label htmlFor={`conflict-${number}`}>Case {number}</label>
              <select
                id={`conflict-${number}`}
                value={pending.choices[number]}
                onChange={(event) =>
                  setPending({ ...pending, choices: { ...pending.choices, [number]: event.target.value as ImportChoice } })
                }
              >
                {(Object.keys(CHOICE_LABELS) as ImportChoice[]).map((choice) => (
                  <option key={choice} value={choice}>
                    {CHOICE_LABELS[choice]}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <div className="button-row">
            <button type="button" className="primary" disabled={busy} onClick={() => void confirm()}>
              {busy ? 'Importing…' : 'Import'}
            </button>
            <button type="button" className="link" disabled={busy} onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
