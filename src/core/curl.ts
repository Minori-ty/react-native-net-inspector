import type { NetworkEntry } from '../types';
import { REDACTED } from './serializer';

export interface CurlOptions {
  /** Emit the masked value instead of a `<redacted>` placeholder. */
  revealRedacted?: boolean;
}

/** Renders an entry as a copy-pasteable cURL command. */
export function toCurl(entry: NetworkEntry, options: CurlOptions = {}): string {
  const parts: string[] = [`curl -X ${entry.request.method} '${escapeSingle(entry.request.url)}'`];

  for (const [key, value] of Object.entries(entry.request.headers)) {
    if (value === REDACTED && !options.revealRedacted) {
      parts.push(`  -H '${escapeSingle(key)}: <redacted>'`);
      continue;
    }
    parts.push(`  -H '${escapeSingle(key)}: ${escapeSingle(value)}'`);
  }

  const body = entry.request.body;
  if (body && body.preview) {
    parts.push(`  --data-raw '${escapeSingle(body.preview)}'`);
  }

  return parts.join(' \\\n');
}

function escapeSingle(value: string): string {
  return value.replace(/'/g, `'\\''`);
}
