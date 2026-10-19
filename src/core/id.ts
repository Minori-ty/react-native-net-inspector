let counter = 0;

/**
 * Short, sortable, collision-free id. Uses a base-36 timestamp plus a rolling
 * counter so ids stay unique even when many requests start in the same millisecond.
 */
export function createEntryId(): string {
  counter = (counter + 1) % 0xffffff;
  return `${Date.now().toString(36)}-${counter.toString(36).padStart(3, '0')}`;
}
