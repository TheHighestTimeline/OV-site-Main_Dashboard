// Server-side re-export of the lifecycle/stage machine.
//
// src/lib/stages.js is the SINGLE source of truth for lifecycles, stages, SLAs
// and evidence gates. It is pure JavaScript with no React or DOM dependency, so
// the functions bundle can use it directly and the UI and the server can never
// disagree about what a stage means.
//
// This shim exists only so function code imports './_stages.js' like every other
// helper here instead of reaching across the tree with a relative path in a
// dozen files. esbuild (the configured Netlify bundler) inlines it at build.
export * from '../../src/lib/stages.js';

// ── Terminal task statuses ──────────────────────────────────────────────────
// Master Action Board's Status field has drifted well past the STATUSES list in
// src/constants.js. The live base carries eleven options, and the ones that mean
// "this is finished" are NOT just Done and Canceled:
//
//   Done, Canceled  — the originals the code knew about
//   Archive         — how the board is ACTUALLY cleared in practice. As of
//                     2026-08 it is 138 of 200 records, and there is not a
//                     single Done record in the table.
//   Complete        — a synonym for Done that someone added along the way.
//
// Treating Archive as open meant 69 percent of the board counted as live work
// in Triage, the Today card, participation task counts and Accountability. The
// board looked permanently overloaded because the code and the human disagreed
// about what "finished" means.
//
// One list, imported everywhere, so the next status someone adds only has to be
// classified in a single place.
export const TERMINAL_TASK_STATUSES = ['Done', 'Complete', 'Canceled', 'Archive', 'Archived'];

/** Is this task finished, by any of the names the base uses for it? */
export function isTerminalTaskStatus(status) {
  if (!status) return false;
  return TERMINAL_TASK_STATUSES.some(s => s.toLowerCase() === String(status).trim().toLowerCase());
}

/** Convenience for the common `.filter(isOpenTask)` shape over raw records. */
export function isOpenTaskStatus(status) {
  return !isTerminalTaskStatus(status);
}
