export interface InspectorTheme {
  scheme: 'light' | 'dark';
  /** Screen background the cards sit on (iOS "grouped" grey). */
  background: string;
  /** Raised surface: list rows and section cards. */
  card: string;
  /** Subtle fill inside a card — pressed states, inputs. */
  surfaceAlt: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  onAccent: string;
  success: string;
  warning: string;
  danger: string;
}

export const lightTheme: InspectorTheme = {
  scheme: 'light',
  background: '#F2F2F7',
  card: '#FFFFFF',
  surfaceAlt: '#EFEFF4',
  border: '#E3E3E8',
  borderStrong: '#D1D1D6',
  text: '#1C1C1E',
  textMuted: '#7C7C80',
  textFaint: '#AEAEB2',
  accent: '#0A84FF',
  onAccent: '#FFFFFF',
  success: '#16A34A',
  warning: '#C2740A',
  danger: '#EF4444',
};

export const darkTheme: InspectorTheme = {
  scheme: 'dark',
  background: '#0E1116',
  card: '#1A1E25',
  surfaceAlt: '#252A33',
  border: '#2C323C',
  borderStrong: '#3B4350',
  text: '#EDF1F6',
  textMuted: '#9AA4B2',
  textFaint: '#6F7987',
  accent: '#4DA3F5',
  onAccent: '#0B1017',
  success: '#4EC27F',
  warning: '#E0A33F',
  danger: '#F0736F',
};

export function resolveTheme(scheme: string | null | undefined): InspectorTheme {
  return scheme === 'dark' ? darkTheme : lightTheme;
}

/**
 * One colour per method, matching the palette the list is designed around.
 * All of them are mid-tone so white badge text stays legible in both schemes.
 */
const METHOD_COLORS: Record<string, string> = {
  GET: '#0A84FF',
  POST: '#8B5CF6',
  PUT: '#F97316',
  PATCH: '#A16207',
  DELETE: '#EF4444',
  HEAD: '#6B7280',
  OPTIONS: '#6B7280',
};

export function methodColor(method: string): string {
  return METHOD_COLORS[method.toUpperCase()] ?? '#6B7280';
}

export function statusColor(status: number, theme: InspectorTheme): string {
  if (status >= 200 && status < 300) return theme.success;
  if (status >= 300 && status < 400) return theme.warning;
  if (status >= 400) return theme.danger;
  return theme.textMuted;
}

export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || Number.isNaN(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || Number.isNaN(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * The path plus query string, with the host stripped — the shape the list row
 * shows. The host stays available in the detail view.
 */
export function displayPath(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}
