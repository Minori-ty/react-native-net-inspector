import {
  byteLength,
  detectBodyKind,
  headersToObject,
  pickHeader,
  redactHeaders,
  snapshotBody,
  truncateByBytes,
} from '../core/serializer';
import type { NetworkStore } from '../core/store';
import type { BodyKind, NetworkState } from '../types';
import { withoutXhrCapture } from './suppress';

const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

type FetchLike = (input: unknown, init?: unknown) => Promise<Response>;

interface DescribedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Patches `global.fetch` for the semantics XHR cannot see: the `Request` object,
 * `init.headers`, and a `Response` we can clone before the caller consumes it.
 *
 * Note that RN's fetch is a whatwg-fetch polyfill over XHR, so the XHR patch
 * already covers it — this patch exists to capture richer detail, not to widen
 * coverage.
 */
export function patchFetch(store: NetworkStore): () => void {
  const scope = globalThis as unknown as { fetch?: unknown };
  const original = scope.fetch;
  if (typeof original !== 'function') return () => {};

  const originalFetch = original as FetchLike;

  const patched: FetchLike = async (input, init) => {
    const { config } = store;
    const described = describeRequest(input, init);

    if (!config.enabled || config.ignore(described.url, described.method)) {
      return originalFetch(input, init);
    }

    const startedAt = Date.now();
    const sentAt = now();

    const id = store.begin({
      source: 'fetch',
      method: described.method,
      url: described.url,
      headers: redactHeaders(described.headers, config.redactHeaders),
      body: snapshotBody(described.body, {
        bodyLimit: config.bodyLimit,
        mimeType: pickHeader(described.headers, 'content-type'),
      }),
      startedAt,
    });

    try {
      // whatwg-fetch drives its own XHR synchronously inside this call. Suppress
      // XHR capture for that window so the request is recorded exactly once.
      const response = await withoutXhrCapture(() => originalFetch(input, init));
      const headers = redactHeaders(headersToObject(response.headers), config.redactHeaders);
      const mimeType = pickHeader(headers, 'content-type');
      const state: NetworkState = response.status >= 200 && response.status < 400 ? 'success' : 'error';

      store.patch(id, {
        response: {
          status: response.status,
          statusText: response.statusText,
          headers,
          mimeType,
        },
      });

      // Must clone synchronously, before the caller touches the body.
      const clone = cloneResponse(response);
      if (!clone) {
        store.patch(id, { state, timing: { duration: now() - sentAt } });
        return response;
      }

      readClone(clone, config.bodyLimit, mimeType)
        .then((captured) => {
          store.patch(id, {
            state,
            responseBody: {
              kind: captured.kind,
              preview: captured.preview,
              size: captured.size,
              truncated: captured.truncated,
              mimeType,
            },
            timing: { duration: now() - sentAt },
            size: { responseBytes: captured.size },
          });
        })
        .catch(() => {
          store.patch(id, { state, timing: { duration: now() - sentAt } });
        });

      return response;
    } catch (error) {
      store.patch(id, {
        state: 'error',
        timing: { duration: now() - sentAt },
        error: {
          name: error instanceof Error ? error.name : undefined,
          message: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  };

  scope.fetch = patched;

  return () => {
    scope.fetch = original;
  };
}

function describeRequest(input: unknown, init: unknown): DescribedRequest {
  const initObject = (init ?? {}) as { method?: string; headers?: unknown; body?: unknown };
  let method = initObject.method ?? 'GET';
  let url = '';
  let headers: unknown = initObject.headers;
  let body: unknown = initObject.body;

  if (input && typeof input === 'object' && typeof (input as { url?: unknown }).url === 'string') {
    const requestLike = input as { url: string; method?: string; headers?: unknown; _bodyInit?: unknown };
    url = requestLike.url;
    if (!initObject.method && requestLike.method) method = requestLike.method;
    if (headers === undefined) headers = requestLike.headers;
    // whatwg-fetch keeps the original body on `_bodyInit`. Only strings are read —
    // a stream here must not be consumed or the real request would break.
    if (body === undefined && typeof requestLike._bodyInit === 'string') {
      body = requestLike._bodyInit;
    }
  } else if (typeof input === 'string') {
    url = input;
  } else if (input && typeof input === 'object' && typeof (input as { href?: unknown }).href === 'string') {
    url = (input as { href: string }).href;
  } else if (input !== undefined && input !== null) {
    url = String(input);
  }

  return {
    method: String(method).toUpperCase(),
    url,
    headers: headersToObject(headers),
    body,
  };
}

function cloneResponse(response: Response): Response | null {
  try {
    if (typeof response.clone !== 'function') return null;
    return response.clone();
  } catch {
    // Streaming or otherwise uncloneable bodies.
    return null;
  }
}

interface CapturedBody {
  kind: BodyKind;
  preview: string;
  size: number;
  truncated: boolean;
}

/**
 * Reads the clone via `text()` rather than a stream reader: React Native's fetch
 * buffers the whole body anyway, and `TextDecoder` is not guaranteed on Hermes.
 */
async function readClone(response: Response, bodyLimit: number, mimeType?: string): Promise<CapturedBody> {
  const text = await response.text();
  const size = byteLength(text);
  const { text: preview, truncated } = truncateByBytes(text, bodyLimit);
  return { kind: detectBodyKind(preview, mimeType), preview, size, truncated };
}
