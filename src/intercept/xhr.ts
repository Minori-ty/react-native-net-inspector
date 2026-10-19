import {
  byteLength,
  parseRawHeaders,
  pickHeader,
  redactHeaders,
  snapshotBody,
  snapshotText,
} from '../core/serializer';
import type { NetworkStore } from '../core/store';
import type { BodySnapshot } from '../types';
import { isXhrCaptureSuppressed } from './suppress';

const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

interface XhrMeta {
  id: string | null;
  method: string;
  url: string;
  headers: Record<string, string>;
  startedAt: number;
  sentAt: number;
  ttfb?: number;
  responseBytes?: number;
  settled?: 'error' | 'timeout' | 'aborted';
  finished?: boolean;
}

/**
 * Wraps `XMLHttpRequest` by subclassing rather than rewriting the prototype.
 *
 * This is the single highest-leverage hook in the whole library: React Native's
 * `fetch` is a whatwg-fetch polyfill sitting on top of XHR, and axios uses the
 * `xhr` adapter on React Native. Patching XHR therefore catches both, while a
 * `global.fetch` patch alone would silently miss every axios call.
 */
export function patchXhr(store: NetworkStore): () => void {
  const scope = globalThis as unknown as { XMLHttpRequest?: unknown };
  const Original = scope.XMLHttpRequest;
  if (typeof Original !== 'function') return () => {};

  const metaMap = new WeakMap<object, XhrMeta>();
  const observed = new WeakSet<object>();

  // The base is intentionally untyped: subclassing a host class whose shape
  // differs between Hermes, JSC and browsers would otherwise fight the checker.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Base: any = Original;

  /**
   * Listeners are attached once per instance and always read the *current* meta,
   * because a single XHR object can be reused via `open()`.
   */
  function attach(xhr: XMLHttpRequest): void {
    if (observed.has(xhr)) return;
    observed.add(xhr);

    const settle = (kind: 'error' | 'timeout' | 'aborted') => () => {
      const meta = metaMap.get(xhr);
      if (meta) meta.settled = kind;
    };
    xhr.addEventListener('error', settle('error'));
    xhr.addEventListener('timeout', settle('timeout'));
    xhr.addEventListener('abort', settle('aborted'));

    xhr.addEventListener('progress', (event) => {
      const meta = metaMap.get(xhr);
      if (meta && typeof event.loaded === 'number') meta.responseBytes = event.loaded;
    });

    xhr.addEventListener('readystatechange', () => {
      const meta = metaMap.get(xhr);
      if (!meta || !meta.id || meta.finished) return;

      if (xhr.readyState === 2) {
        onHeaders(xhr, meta, store);
      } else if (xhr.readyState === 4) {
        // Fallback only, for environments that never fire `loadend`.
        //
        // React Native dispatches `readystatechange` *before* abort / timeout /
        // error, so finalizing here directly would classify a timeout or an abort
        // as a plain network error — and would drop the reason entirely.
        // Deferring one tick lets the terminal event land first.
        setTimeout(() => {
          if (!meta.finished) finalize(xhr, meta, store);
        }, 0);
      }
    });

    // `loadend` is guaranteed to be the last event of a request, so it is the
    // only point where `settled` is certain to reflect the real outcome.
    xhr.addEventListener('loadend', () => {
      const meta = metaMap.get(xhr);
      if (!meta || !meta.id) return;
      finalize(xhr, meta, store);
    });
  }

  class PatchedXMLHttpRequest extends Base {
    open(method: string, url: string | URL, ...rest: unknown[]): void {
      metaMap.set(this, {
        id: null,
        method: String(method ?? 'GET').toUpperCase(),
        url: String(url ?? ''),
        headers: {},
        startedAt: 0,
        sentAt: 0,
      });
      super.open(method, url, ...rest);
    }

    setRequestHeader(name: string, value: string): void {
      const meta = metaMap.get(this);
      if (meta) meta.headers[name] = value;
      super.setRequestHeader(name, value);
    }

    send(body?: unknown): void {
      const meta = metaMap.get(this);
      const { config } = store;

      // Suppressed when this XHR was created by our patched fetch, which records
      // the request itself — otherwise a single fetch call yields two entries.
      if (
        meta &&
        !isXhrCaptureSuppressed() &&
        config.enabled &&
        !config.ignore(meta.url, meta.method)
      ) {
        meta.startedAt = Date.now();
        meta.sentAt = now();
        meta.id = store.begin({
          source: 'xhr',
          method: meta.method,
          url: meta.url,
          headers: redactHeaders(meta.headers, config.redactHeaders),
          // The request's own Content-Type is the only reliable hint about the
          // body's shape: clients such as axios serialize a URLSearchParams (or a
          // plain object) into a string before the adapter ever sees it.
          body: snapshotBody(body, {
            bodyLimit: config.bodyLimit,
            mimeType: pickHeader(meta.headers, 'content-type'),
          }),
          startedAt: meta.startedAt,
        });
        attach(this as unknown as XMLHttpRequest);
      }

      super.send(body);
    }
  }

  scope.XMLHttpRequest = PatchedXMLHttpRequest;

  return () => {
    scope.XMLHttpRequest = Original;
  };
}

function onHeaders(xhr: XMLHttpRequest, meta: XhrMeta, store: NetworkStore): void {
  if (!meta.id) return;
  meta.ttfb = now() - meta.sentAt;
  const headers = readHeaders(xhr, store);

  store.patch(meta.id, {
    timing: { ttfb: meta.ttfb },
    response: {
      status: safeStatus(xhr),
      statusText: safeStatusText(xhr),
      headers,
      mimeType: pickHeader(headers, 'content-type'),
    },
  });
}

/** Runs at most once per request, from whichever terminal event arrives first. */
function finalize(xhr: XMLHttpRequest, meta: XhrMeta, store: NetworkStore): void {
  if (meta.finished || !meta.id) return;
  meta.finished = true;

  const duration = now() - meta.sentAt;
  const headers = readHeaders(xhr, store);
  const mimeType = pickHeader(headers, 'content-type');

  if (meta.settled) {
    store.patch(meta.id, {
      state: meta.settled,
      timing: { duration },
      error: { message: describeSettled(meta.settled, xhr) },
    });
    return;
  }

  const status = safeStatus(xhr);
  const { body, size } = readResponseBody(xhr, store.config.bodyLimit, mimeType);

  store.patch(meta.id, {
    state: status >= 200 && status < 400 ? 'success' : 'error',
    response: { status, statusText: safeStatusText(xhr), headers, body, mimeType },
    timing: { duration },
    size: { responseBytes: size ?? meta.responseBytes },
  });
}

function readHeaders(xhr: XMLHttpRequest, store: NetworkStore): Record<string, string> {
  let raw = '';
  try {
    raw = xhr.getAllResponseHeaders() ?? '';
  } catch {
    raw = '';
  }
  return redactHeaders(parseRawHeaders(raw), store.config.redactHeaders);
}

/**
 * `responseText` throws when `responseType` is `blob` or `arraybuffer`, so every
 * branch is guarded and binary payloads are recorded by size only.
 */
function readResponseBody(
  xhr: XMLHttpRequest,
  bodyLimit: number,
  mimeType?: string,
): { body?: BodySnapshot; size?: number } {
  try {
    const responseType = xhr.responseType;

    if (responseType === 'arraybuffer') {
      const buffer = xhr.response as ArrayBuffer | null;
      if (!buffer) return {};
      return {
        body: { kind: 'binary', preview: '', size: buffer.byteLength, truncated: false, mimeType },
        size: buffer.byteLength,
      };
    }

    if (responseType === 'blob') {
      const blob = xhr.response as Blob | null;
      if (!blob) return {};
      return {
        body: {
          kind: 'binary',
          preview: '',
          size: blob.size,
          truncated: false,
          mimeType: blob.type || mimeType,
        },
        size: blob.size,
      };
    }

    if (responseType === 'json') {
      const value = xhr.response as unknown;
      if (value === null || value === undefined) return {};
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      if (typeof serialized !== 'string') return {};
      return {
        body: snapshotText(serialized, bodyLimit, mimeType ?? 'application/json'),
        size: byteLength(serialized),
      };
    }

    if (responseType === 'document') return {};

    const text = xhr.responseText;
    if (typeof text !== 'string') return {};
    return { body: snapshotText(text, bodyLimit, mimeType), size: byteLength(text) };
  } catch {
    return {};
  }
}

function safeStatus(xhr: XMLHttpRequest): number {
  try {
    return xhr.status ?? 0;
  } catch {
    return 0;
  }
}

function safeStatusText(xhr: XMLHttpRequest): string {
  try {
    return xhr.statusText ?? '';
  } catch {
    return '';
  }
}

/**
 * Error text is deliberately not localised: it is produced far from the UI, on
 * the capture path, and ends up in `error.message` where a developer reads it.
 * The panel translates the *state* label; this is the supporting detail.
 */
function describeSettled(kind: 'error' | 'timeout' | 'aborted', xhr: XMLHttpRequest): string {
  if (kind === 'timeout') {
    let limit = 0;
    try {
      limit = xhr.timeout ?? 0;
    } catch {
      limit = 0;
    }
    return `Request timed out (timeout ${limit}ms)`;
  }
  if (kind === 'aborted') return 'Request aborted';
  return 'Network error (status 0)';
}
