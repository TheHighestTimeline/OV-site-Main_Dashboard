// ─────────────────────────────────────────────────────────────────────────────
// useTabState — persists scroll position, active sub-tab, and filter state
// to sessionStorage so each view remembers where the user left off.
//
// Usage:
//   const [state, setState] = useTabState('contacts');
//   // state = { subTab, scrollY, filters }
//
// The key is derived from the view/route name so each tab has its own slot.
// Data is written to sessionStorage (cleared when the browser tab closes).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Default shape for a tab's persisted state.
 * Extend per-view by merging in your own defaults.
 */
const DEFAULT_STATE = {
  subTab:  null,   // active sub-tab string (or null if not applicable)
  scrollY: 0,      // scroll position in px
  filters: {},     // arbitrary filter key/value map
};

/**
 * useTabState(viewKey, defaults?)
 *
 * @param {string} viewKey    - storage key, typically the view/route name
 *                              e.g. 'contacts', 'tasks', 'company:ovmg:kanban'
 * @param {object} defaults   - optional overrides to DEFAULT_STATE
 *
 * @returns {[object, function, function]}
 *   [state, setState, resetState]
 *   - state:      current persisted state
 *   - setState:   merge-update the state (shallow merge, writes through to storage)
 *   - resetState: clear the persisted state back to defaults
 */
export default function useTabState(viewKey, defaults = {}) {
  const storageKey = `tabstate:${viewKey}`;

  const initial = useCallback(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        return { ...DEFAULT_STATE, ...defaults, ...JSON.parse(raw) };
      }
    } catch {
      // ignore parse errors
    }
    return { ...DEFAULT_STATE, ...defaults };
  }, [storageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const [state, _setState] = useState(initial);

  // Write-through to sessionStorage on every state change
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // quota exceeded or private browsing — silently ignore
    }
  }, [state, storageKey]);

  // Shallow-merge update (mimics React class setState)
  const setState = useCallback((patch) => {
    _setState(prev => ({
      ...prev,
      ...(typeof patch === 'function' ? patch(prev) : patch),
    }));
  }, []);

  const resetState = useCallback(() => {
    sessionStorage.removeItem(storageKey);
    _setState({ ...DEFAULT_STATE, ...defaults });
  }, [storageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return [state, setState, resetState];
}

// ─── Scroll restoration helper ────────────────────────────────────────────────
/**
 * useScrollRestore(viewKey, containerRef?)
 *
 * Automatically saves & restores scroll position for a container element.
 * If containerRef is omitted, it tracks window scroll.
 *
 * @param {string}        viewKey       - same key used by useTabState
 * @param {React.Ref}     containerRef  - optional ref to the scrollable element
 */
export function useScrollRestore(viewKey, containerRef) {
  const storageKey = `scrollpos:${viewKey}`;
  const savedY = useRef(0);

  // Restore on mount
  useEffect(() => {
    try {
      const y = parseInt(sessionStorage.getItem(storageKey) || '0', 10);
      savedY.current = y;
      const el = containerRef?.current;
      if (el) {
        el.scrollTop = y;
      } else {
        window.scrollTo(0, y);
      }
    } catch {
      // ignore
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Save on unmount
  useEffect(() => {
    const el = containerRef?.current;
    const getY = () => el ? el.scrollTop : window.scrollY;

    const onScroll = () => {
      savedY.current = getY();
    };

    const target = el || window;
    target.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      target.removeEventListener('scroll', onScroll);
      try {
        sessionStorage.setItem(storageKey, String(savedY.current));
      } catch {
        // ignore
      }
    };
  }, [containerRef, storageKey]);
}
