import type { ResultRow } from './experiment';
const STORAGE_KEY = 'philearn.r0.results';
const MAX_ROWS = 1000;
export function readLedger(): ResultRow[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter(row => row && typeof row === 'object' && typeof row.taskId === 'string' && typeof row.correct === 'boolean' && (row.provenance === 'SIMULATED' || row.provenance === 'OBSERVED')) as ResultRow[];
  } catch { return []; }
}
export function writeLedger(rows: ResultRow[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(-MAX_ROWS))); }
  catch { /* Storage may be disabled; session results still work. */ }
}
export function downloadLedger(rows: ResultRow[]) {
  const object = { format: 'philearn-ledger-v0.1', exportedAt: new Date().toISOString(), caveat: 'SIMULATED rows are demonstration only, not model evidence.', rows };
  const url = URL.createObjectURL(new Blob([JSON.stringify(object, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = `philearn-ledger-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
