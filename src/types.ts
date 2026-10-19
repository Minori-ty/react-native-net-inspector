/**
 * Public data model. Everything the inspector captures is normalized into a
 * `NetworkEntry` so that fetch, axios and raw XHR traffic can be mixed in one list.
 */

export type NetworkSource = 'fetch' | 'xhr';

/**
 * Transport outcome.
 *
 * - `success` — completed with a 2xx / 3xx status
 * - `error`   — completed with 4xx / 5xx, or failed at the transport layer (see `error`)
 * - `timeout` — the request exceeded its configured timeout
 * - `aborted` — cancelled by the caller (AbortController / xhr.abort())
 * - `pending` — still in flight
 */
export type NetworkState = 'pending' | 'success' | 'error' | 'timeout' | 'aborted';

export type BodyKind = 'empty' | 'text' | 'json' | 'form' | 'binary' | 'stream';

export interface BodySnapshot {
  kind: BodyKind;
  /** Truncated textual preview. Always empty for binary / stream bodies. */
  preview: string;
  /** Byte length of the *original* body, not of `preview`. */
  size: number;
  /** True when the original body was larger than the configured `bodyLimit`. */
  truncated: boolean;
  /** True when the preview was evicted to stay inside `byteBudget`. */
  dropped?: boolean;
  mimeType?: string;
}

export interface NetworkTiming {
  /** Epoch milliseconds when the request was initiated. */
  startedAt: number;
  /**
   * Milliseconds from send to response headers.
   * Only measured on the XHR path — the fetch spec exposes no TTFB, so it stays
   * undefined there rather than reporting a misleading value.
   */
  ttfb?: number;
  /** Milliseconds from send to completion. */
  duration?: number;
}

export interface NetworkRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: BodySnapshot;
}

export interface NetworkResponse {
  status: number;
  statusText?: string;
  headers: Record<string, string>;
  body?: BodySnapshot;
  mimeType?: string;
}

export interface NetworkError {
  name?: string;
  message: string;
}

export interface NetworkEntry {
  id: string;
  source: NetworkSource;
  state: NetworkState;
  request: NetworkRequest;
  response?: NetworkResponse;
  timing: NetworkTiming;
  size: {
    requestBytes?: number;
    responseBytes?: number;
  };
  error?: NetworkError;
}

/**
 * Sends text somewhere — the clipboard by default.
 *
 * May be async: when it returns a promise the UI waits for it and reports a
 * failure rather than claiming the copy succeeded.
 */
export type CopyHandler = (text: string, label: string) => void | Promise<void>;

export interface InspectorConfig {  /** Master switch. When false the patches are installed but stay transparent. */
  enabled: boolean;
  /** Ring buffer capacity. Oldest entries are evicted first. */
  maxEntries: number;
  /**
   * Total budget for stored body previews, in approximate bytes.
   * When exceeded, previews are dropped from the oldest entries first —
   * metadata is always kept so the list stays useful.
   */
  byteBudget: number;
  /** Per-body cap. Larger bodies are truncated and flagged. */
  bodyLimit: number;
  /** Header names whose values are masked. Compared case-insensitively. */
  redactHeaders: string[];
  /** Return true to skip capturing a request entirely. */
  ignore: (url: string, method: string) => boolean;
}
