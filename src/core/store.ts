import type {
  BodySnapshot,
  InspectorConfig,
  NetworkEntry,
  NetworkError,
  NetworkResponse,
  NetworkSource,
  NetworkState,
  NetworkTiming,
} from '../types';
import { createEntryId } from './id';

export const defaultConfig: InspectorConfig = {
  enabled: true,
  maxEntries: 500,
  byteBudget: 12 * 1024 * 1024,
  bodyLimit: 100 * 1024,
  // Empty by default: this is a development-only debugging surface, so headers
  // are shown verbatim. Opt back in per-app via `redactHeaders: [...]`.
  redactHeaders: [],
  ignore: () => false,
};

export interface BeginInput {
  source: NetworkSource;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: BodySnapshot;
  startedAt: number;
}

export interface EntryPatch {
  state?: NetworkState;
  /** Replaces the whole response object. */
  response?: NetworkResponse;
  /** Merges into the existing response — used once a body has been read. */
  responseBody?: BodySnapshot;
  timing?: Partial<NetworkTiming>;
  size?: Partial<NetworkEntry['size']>;
  error?: NetworkError;
}

type Listener = () => void;

/**
 * Framework-agnostic ring buffer with pub/sub. Deliberately free of React and
 * React Native imports so it can be unit-tested and reasoned about on its own.
 *
 * Entries are treated as immutable: every mutation produces a new object and a
 * new array. That is what lets `useSyncExternalStore` bail out of re-rendering
 * when nothing actually changed.
 */
export class NetworkStore {
  config: InspectorConfig = { ...defaultConfig };

  private entries: readonly NetworkEntry[] = [];
  private index = new Map<string, NetworkEntry>();
  private listeners = new Set<Listener>();
  private previewChars = 0;
  private flushQueued = false;

  configure(patch: Partial<InspectorConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Stable reference between mutations — required by `useSyncExternalStore`. */
  getSnapshot = (): readonly NetworkEntry[] => this.entries;

  getEntry = (id: string): NetworkEntry | undefined => this.index.get(id);

  /** Returns the new entry id. */
  begin(input: BeginInput): string {
    const id = createEntryId();
    const entry: NetworkEntry = {
      id,
      source: input.source,
      state: 'pending',
      request: {
        method: input.method,
        url: input.url,
        headers: input.headers,
        body: input.body,
      },
      timing: { startedAt: input.startedAt },
      size: { requestBytes: input.body?.size },
    };

    this.entries = [entry, ...this.entries];
    this.index.set(id, entry);
    this.previewChars += previewSize(entry);
    this.enforceLimits();
    this.scheduleFlush();
    return id;
  }

  patch(id: string, patch: EntryPatch): void {
    const current = this.index.get(id);
    if (!current) return;

    let response = current.response;
    if (patch.response) {
      response = patch.response;
    } else if (patch.responseBody) {
      response = { ...(current.response ?? { status: 0, headers: {} }), body: patch.responseBody };
    }

    const next: NetworkEntry = {
      id: current.id,
      source: current.source,
      state: patch.state ?? current.state,
      request: current.request,
      response,
      timing: { ...current.timing, ...(patch.timing ?? {}) },
      size: { ...current.size, ...(patch.size ?? {}) },
      error: patch.error ?? current.error,
    };

    this.previewChars += previewSize(next) - previewSize(current);
    this.index.set(id, next);

    const position = this.entries.indexOf(current);
    if (position >= 0) {
      const copy = this.entries.slice();
      copy[position] = next;
      this.entries = copy;
    }

    this.scheduleFlush();
  }

  clear(): void {
    this.entries = [];
    this.index.clear();
    this.previewChars = 0;
    this.scheduleFlush();
  }

  /**
   * Coalesces bursts (a request start plus its patches, or a flood of parallel
   * requests) into a single notification per microtask.
   */
  private scheduleFlush(): void {
    if (this.flushQueued) return;
    this.flushQueued = true;
    Promise.resolve().then(() => {
      this.flushQueued = false;
      for (const listener of Array.from(this.listeners)) listener();
    });
  }

  private enforceLimits(): void {
    const { maxEntries, byteBudget } = this.config;

    if (this.entries.length > maxEntries) {
      for (const dropped of this.entries.slice(maxEntries)) this.index.delete(dropped.id);
      this.entries = this.entries.slice(0, maxEntries);
      this.previewChars = this.entries.reduce((total, entry) => total + previewSize(entry), 0);
    }

    if (this.previewChars > byteBudget) this.dropOldestPreviews();
  }

  /**
   * Degrades the oldest entries by discarding their body previews while keeping
   * every metadata field, so the list stays readable instead of silently losing rows.
   */
  private dropOldestPreviews(): void {
    for (
      let position = this.entries.length - 1;
      position >= 0 && this.previewChars > this.config.byteBudget;
      position -= 1
    ) {
      const entry = this.entries[position];
      const request = dropRequestPreview(entry.request);
      const response = entry.response ? dropResponsePreview(entry.response) : entry.response;
      if (request === entry.request && response === entry.response) continue;

      const next: NetworkEntry = { ...entry, request, response };
      this.previewChars += previewSize(next) - previewSize(entry);
      this.index.set(next.id, next);

      const copy = this.entries.slice();
      copy[position] = next;
      this.entries = copy;
    }
  }
}

/** Shared instance used by the patches and the UI. */
export const networkStore = new NetworkStore();

function previewSize(entry: NetworkEntry): number {
  return (entry.request.body?.preview.length ?? 0) + (entry.response?.body?.preview.length ?? 0);
}

function dropPreview(body: BodySnapshot | undefined): BodySnapshot | undefined {
  if (!body || !body.preview) return body;
  return { ...body, preview: '', truncated: true, dropped: true };
}

function dropRequestPreview(request: NetworkEntry['request']): NetworkEntry['request'] {
  const body = dropPreview(request.body);
  return body === request.body ? request : { ...request, body };
}

function dropResponsePreview(response: NetworkResponse): NetworkResponse {
  const body = dropPreview(response.body);
  return body === response.body ? response : { ...response, body };
}
