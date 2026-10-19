/**
 * Guards against double-recording.
 *
 * React Native's `fetch` is whatwg-fetch, and whatwg-fetch drives an
 * `XMLHttpRequest` internally. Crucially it does so *synchronously* inside the
 * promise executor — it constructs the XHR, calls `open()`, `setRequestHeader()`
 * and `send()` before ever yielding. Without this guard every `fetch()` call
 * would produce two entries: one from the fetch patch and one from the XHR patch.
 *
 * Because that work is synchronous, a plain depth counter around the call is
 * enough — no async context tracking required.
 */
let depth = 0;

export function withoutXhrCapture<T>(run: () => T): T {
  depth += 1;
  try {
    return run();
  } finally {
    depth -= 1;
  }
}

export function isXhrCaptureSuppressed(): boolean {
  return depth > 0;
}
