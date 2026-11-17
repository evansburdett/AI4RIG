/**
 * Bucket reports (RIG, 11/2): each one kept as it was generated, so the
 * advisor can reread last quarter's at this quarter's review.
 */

import type { Db } from '@ai4rig/db';
import type { ClientReport, ReportSnapshot } from '@ai4rig/shared';

interface ReportRow {
  id: number;
  created_at: string;
  body: string;
}

const toReport = (row: ReportRow): ClientReport => ({
  id: String(row.id),
  createdAt: row.created_at,
  snapshot: JSON.parse(row.body) as ReportSnapshot,
});

function caseId(db: Db, clientNumber: string): number | null {
  return (
    db.prepare<[string], { id: number }>('SELECT id FROM client_cases WHERE client_number = ?').get(clientNumber)
      ?.id ?? null
  );
}

/** Newest first. Null when there is no such case. */
export function listReports(db: Db, clientNumber: string): ClientReport[] | null {
  const id = caseId(db, clientNumber);
  if (id === null) return null;
  return db
    .prepare<[number], ReportRow>(
      'SELECT id, created_at, body FROM client_reports WHERE client_case_id = ? ORDER BY created_at DESC, id DESC',
    )
    .all(id)
    .map(toReport);
}

export function addReport(
  db: Db,
  clientNumber: string,
  snapshot: unknown,
  createdAt: string = new Date().toISOString(),
): ClientReport | null {
  const id = caseId(db, clientNumber);
  if (id === null) return null;
  const { lastInsertRowid } = db
    .prepare('INSERT INTO client_reports (client_case_id, created_at, body) VALUES (?, ?, ?)')
    .run(id, createdAt, JSON.stringify(snapshot));
  const row = db
    .prepare<[number], ReportRow>('SELECT id, created_at, body FROM client_reports WHERE id = ?')
    .get(Number(lastInsertRowid));
  return row === undefined ? null : toReport(row);
}

export function deleteReport(db: Db, clientNumber: string, reportId: string): boolean {
  const id = caseId(db, clientNumber);
  if (id === null) return false;
  return (
    db.prepare('DELETE FROM client_reports WHERE id = ? AND client_case_id = ?').run(Number(reportId), id).changes > 0
  );
}
