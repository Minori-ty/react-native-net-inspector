import {
  getRawHeaders,
  Headers as HeadersPolyfill,
  stringToHeaders,
} from 'headers-polyfill';
import stringifySafe from 'json-stringify-safe';

import type { BodyKind, BodySnapshot } from '../types';

/** Placeholder written in place of a masked header value. */
export const REDACTED = '••••••';

/**
 * Above this size we assume JSON from the leading character instead of paying
 * for a full `JSON.parse` on the capture path.
 */
const JSON_SNIFF_LIMIT = 4096;

/**
 * `TextEncoder` counts UTF-8 bytes natively; the char-by-char loops below only
 * run on runtimes without it (a very old Hermes build).
 */
const encoder: TextEncoder | null =
  typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const decoder: TextDecoder | null =
  typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

/** UTF-8 byte length. */
export function byteLength(value: string): number {
  if (encoder) return encoder.encode(value).length;

  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      index += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

/** Truncates on a byte boundary without splitting a multi-byte code point. */
export function truncateByBytes(value: string, limit: number): { text: string; truncated: boolean } {
  if (limit <= 0) return { text: '', truncated: value.length > 0 };

  if (encoder && decoder) {
    const bytes = encoder.encode(value);
    if (bytes.length <= limit) return { text: value, truncated: false };
    // Step back to the start of the code point `limit` lands inside, so decoding
    // never turns a half-cut character into a replacement glyph.
    let cut = limit;
    while (cut > 0 && (bytes[cut] & 0xc0) === 0x80) cut -= 1;
    return { text: decoder.decode(bytes.subarray(0, cut)), truncated: true };
  }

  if (byteLength(value) <= limit) return { text: value, truncated: false };

  let bytes = 0;
  let index = 0;
  while (index < value.length) {
    const code = value.charCodeAt(index);
    let size = 1;
    if (code >= 0xd800 && code <= 0xdbff) size = 4;
    else if (code >= 0x800) size = 3;
    else if (code >= 0x80) size = 2;
    if (bytes + size > limit) break;
    bytes += size;
    index += 1;
  }
  return { text: value.slice(0, index), truncated: true };
}

type PolyfillHeadersInit = NonNullable<ConstructorParameters<typeof HeadersPolyfill>[0]>;

/**
 * Parses the raw `getAllResponseHeaders()` string via `headers-polyfill`, whose
 * parser handles multi-line values and `: ` inside URLs correctly.
 */
export function parseRawHeaders(raw: string): Record<string, string> {
  if (!raw) return {};
  return getRawHeaders(stringToHeaders(raw));
}

/** Normalizes `Headers`, a plain object, an entry array or a raw string. */
export function headersToObject(headers: unknown): Record<string, string> {
  if (!headers) return {};
  if (typeof headers === 'string') return parseRawHeaders(headers);
  return getRawHeaders(new HeadersPolyfill(headers as PolyfillHeadersInit));
}

/** Case-insensitive single header lookup. */
export function pickHeader(headers: Record<string, string>, name: string): string | undefined {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return value;
  }
  return undefined;
}

export function redactHeaders(
  headers: Record<string, string>,
  patterns: readonly string[],
): Record<string, string> {
  if (patterns.length === 0) return headers;
  const masked = new Set(patterns.map((pattern) => pattern.toLowerCase()));
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key] = masked.has(key.toLowerCase()) ? REDACTED : value;
  }
  return result;
}

export function detectBodyKind(text: string, mimeType?: string): BodyKind {
  if (!text) return 'empty';
  if (mimeType) {
    if (/json/i.test(mimeType)) return 'json';
    if (/x-www-form-urlencoded/i.test(mimeType)) return 'form';
  }
  const head = text.trimStart().charAt(0);
  if (head === '{' || head === '[') {
    if (text.length > JSON_SNIFF_LIMIT) return 'json';
    try {
      JSON.parse(text);
      return 'json';
    } catch {
      return 'text';
    }
  }
  return 'text';
}

/**
 * `JSON.stringify` with circular references handled (`[Circular]` placeholders
 * instead of throwing) — request bodies can legitimately reference themselves.
 */
export function safeStringify(value: unknown): string | undefined {
  try {
    return stringifySafe(value);
  } catch {
    return undefined;
  }
}

export interface SnapshotOptions {
  bodyLimit: number;
  mimeType?: string;
}

/** Wraps a plain string into a `BodySnapshot`, truncating past the limit. */
export function snapshotText(text: string, limit: number, mimeType?: string): BodySnapshot {
  const size = byteLength(text);
  const { text: preview, truncated } = truncateByBytes(text, limit);
  return { kind: detectBodyKind(preview, mimeType), preview, size, truncated, mimeType };
}

/**
 * Normalizes anything that can be passed as a request body.
 * Never consumes streams — reading one here would break the actual request.
 */
export function snapshotBody(body: unknown, options: SnapshotOptions): BodySnapshot | undefined {
  if (body === undefined || body === null) return undefined;
  const { bodyLimit, mimeType } = options;

  if (typeof body === 'string') return snapshotText(body, bodyLimit, mimeType);

  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
    return snapshotText(body.toString(), bodyLimit, mimeType ?? 'application/x-www-form-urlencoded');
  }

  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    return snapshotFormData(body, bodyLimit);
  }

  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return {
      kind: 'binary',
      preview: '',
      size: body.size,
      truncated: false,
      mimeType: body.type || mimeType,
    };
  }

  if (isBinary(body)) {
    return { kind: 'binary', preview: '', size: binarySize(body), truncated: false, mimeType };
  }

  if (isStream(body)) {
    return { kind: 'stream', preview: '', size: 0, truncated: false, mimeType };
  }

  if (typeof body === 'object') {
    const serialized = safeStringify(body);
    if (serialized !== undefined) {
      return snapshotText(serialized, bodyLimit, mimeType ?? 'application/json');
    }
    return { kind: 'binary', preview: '', size: 0, truncated: false, mimeType };
  }

  return snapshotText(String(body), bodyLimit, mimeType);
}

function isBinary(value: unknown): boolean {
  if (typeof ArrayBuffer === 'undefined') return false;
  return value instanceof ArrayBuffer || ArrayBuffer.isView(value);
}

function binarySize(value: unknown): number {
  if (value instanceof ArrayBuffer) return value.byteLength;
  return (value as ArrayBufferView).byteLength;
}

function isStream(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { getReader?: unknown }).getReader === 'function'
  );
}

function snapshotFormData(form: FormData, limit: number): BodySnapshot {
  const parts = readFormParts(form);
  const chunks: string[] = [];
  for (const [key, value] of parts) {
    chunks.push(`${key}=${describeFormValue(value)}`);
  }
  const snapshot = snapshotText(chunks.join('&'), limit, 'multipart/form-data');
  return { ...snapshot, kind: 'form' };
}

/**
 * React Native's FormData exposes its entries through `getParts()`. Those parts
 * are plain objects — `{ fieldName, string }` for text and
 * `{ fieldName, uri, name, type }` for files — not `[name, value]` tuples.
 * The web implementation only has the private `_parts` array of tuples.
 *
 * Both shapes are normalized here. Array-destructuring a `getParts()` object
 * throws "Invalid attempt to destructure non-iterable instance" on Hermes, and
 * that throw escapes the fetch/XHR patch and aborts the request being observed
 * (photo uploads via FormData fail before they are sent).
 */
function readFormParts(form: FormData): Array<[string, unknown]> {
  const candidate = form as unknown as { getParts?: () => unknown; _parts?: unknown };
  try {
    if (typeof candidate.getParts === 'function') {
      const parts = candidate.getParts();
      if (Array.isArray(parts)) return normalizeFormParts(parts);
    }
    if (Array.isArray(candidate._parts)) {
      return normalizeFormParts(candidate._parts);
    }
  } catch {
    // A FormData implementation we cannot introspect — report it as opaque.
  }
  return [];
}

function normalizeFormParts(parts: unknown[]): Array<[string, unknown]> {
  const normalized: Array<[string, unknown]> = [];
  for (const part of parts) {
    const entry = normalizeFormPart(part);
    if (entry) normalized.push(entry);
  }
  return normalized;
}

function normalizeFormPart(part: unknown): [string, unknown] | null {
  if (Array.isArray(part)) {
    const key = part[0];
    return [typeof key === 'string' ? key : String(key ?? ''), part[1]];
  }
  if (!part || typeof part !== 'object') return null;

  const record = part as { fieldName?: unknown; name?: unknown; string?: unknown };
  // `name` on a file part is the filename. The form field is `fieldName`.
  const key =
    typeof record.fieldName === 'string'
      ? record.fieldName
      : typeof record.name === 'string'
        ? record.name
        : '';
  if (typeof record.string === 'string') return [key, record.string];
  return [key, part];
}

function describeFormValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const file = value as { uri?: string; name?: string; type?: string };
    if (typeof file.uri === 'string') {
      return `<file ${file.name ?? 'unnamed'}${file.type ? ` ${file.type}` : ''}>`;
    }
    return safeStringify(value) ?? '[object]';
  }
  return String(value);
}
