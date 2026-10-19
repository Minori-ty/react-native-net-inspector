import type { NetworkEntry } from '../types';

/**
 * How many entries are newer than the `seenId` watermark.
 *
 * Entries are stored newest-first, so the answer is simply the watermark's
 * position in the list.
 *
 * Two edge cases matter:
 * - `null` watermark means nothing has been looked at yet, so everything counts.
 * - A watermark that is no longer present was evicted by the ring buffer, which
 *   only ever drops the *oldest* entries — so everything still in the list is
 *   newer than it.
 */
export function countUnseen(entries: readonly NetworkEntry[], seenId: string | null): number {
  if (seenId === null) return entries.length;
  const index = entries.findIndex((entry) => entry.id === seenId);
  return index < 0 ? entries.length : index;
}

/**
 * The ids of every entry newer than the watermark — the rows a "new" marker
 * belongs on.
 *
 * Derived from `countUnseen` on purpose: the badge count and the per-row markers
 * are two views of the same number, so they can never disagree.
 */
export function unseenIds(
  entries: readonly NetworkEntry[],
  seenId: string | null,
): ReadonlySet<string> {
  const count = countUnseen(entries, seenId);
  if (count === 0) return EMPTY;
  return new Set(entries.slice(0, count).map((entry) => entry.id));
}

const EMPTY: ReadonlySet<string> = new Set();
