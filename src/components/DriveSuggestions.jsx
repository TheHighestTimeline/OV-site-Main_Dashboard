// "12 suggested Drive links" — a count, not a list.
//
// The shape Tanner asked for: not documents cluttering the record, but a button
// that says how many there are, opening a screen where you bulk-link the ones
// that belong and bulk-reject the rest. Rejections are remembered per record, so
// a file you have already said no to never comes back.
//
// This is a thin wrapper over Suggestions — same review screen, same gated
// "Skip the rest", same remembered decisions as the people and task suggesters.
// One pattern for all three, because learning three is two too many.

import { useCallback } from 'react';
import { suggestDriveLinks, linkDriveFile } from '../api.js';
import Suggestions from './Suggestions.jsx';

export default function DriveSuggestions({ kind, id, onLinked, showToast }) {
  const fetcher = useCallback(
    () => suggestDriveLinks(kind, id)
      .then(r => (r?.items || []).map(f => ({
        id: f.id,
        name: f.name,
        reason: f.reason,
        confidence: f.confidence,
        _file: f,
      })))
      // A missing Google connection is not an error worth showing on a card —
      // drive-suggest already returns an empty list with a note for that case.
      .catch(() => []),
    [kind, id],
  );

  const onLink = useCallback(
    async (item) => {
      const f = item._file;
      await linkDriveFile(kind, id, { id: f.id, name: f.name, url: f.url, mimeType: f.mimeType });
      onLinked?.();
    },
    [kind, id, onLinked],
  );

  if (!id) return null;

  return (
    <Suggestions
      collapsed
      noun="drive link"
      title="Drive documents that look related"
      // Scoped per record: "not this file, not on this deal" is a different
      // judgement from "not this file, ever".
      scopeKey={`drive:${kind}:${id}`}
      fetcher={fetcher}
      onLink={async (item) => {
        try { await onLink(item); }
        catch (e) { showToast?.('Could not file that document: ' + e.message); throw e; }
      }}
    />
  );
}
