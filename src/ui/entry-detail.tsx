import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  formatBytes,
  formatDuration,
  methodColor,
  statusColor,
  type InspectorTheme,
} from '../theme';
import type { InspectorStrings } from '../i18n';
import type { BodySnapshot, CopyHandler, NetworkEntry } from '../types';
import { BodyViewer, bodyCopyText } from './body-viewer';
import { Badge, CopyIcon, IconButton, KeyValueRow, Mono, Section } from './primitives';
import { useStrings } from './strings-context';

export function EntryDetail({
  entry,
  theme,
  onCopy,
}: {
  entry: NetworkEntry;
  theme: InspectorTheme;
  onCopy: CopyHandler;
}) {
  const strings = useStrings();
  const status = entry.response?.status;
  const responseHeaders = entry.response?.headers ?? {};
  const responseBody = useMemo(() => bodyCopyText(entry.response?.body), [entry.response?.body]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <View style={styles.summary}>
        <Badge label={entry.request.method} color={methodColor(entry.request.method)} variant="solid" />
        {status !== undefined ? (
          <Text style={[styles.status, { color: statusColor(status, theme) }]}>{status}</Text>
        ) : (
          <Text style={[styles.status, { color: theme.textFaint }]}>{stateLabel(entry, strings)}</Text>
        )}
        <View style={styles.flex} />
        <IconButton
          icon="terminal-outline"
          label={strings.copyCurl}
          theme={theme}
          onPress={() => onCopy(toCurlCommand(entry), strings.copyCurl)}
        />
      </View>

      <Section title={strings.overview} theme={theme}>
        <UrlRow url={entry.request.url} theme={theme} onCopy={onCopy} />
        <KeyValueRow
          label={strings.source}
          value={entry.source === 'xhr' ? 'XMLHttpRequest' : 'fetch'}
          theme={theme}
        />
        <KeyValueRow
          label={strings.startedAt}
          value={new Date(entry.timing.startedAt).toLocaleTimeString()}
          theme={theme}
        />
        <KeyValueRow label={strings.status} value={stateLabel(entry, strings)} theme={theme} last />
      </Section>

      <Section title={strings.timing} theme={theme}>
        <KeyValueRow
          label={strings.ttfb}
          value={
            entry.timing.ttfb === undefined
              ? strings.ttfbUnavailable
              : formatDuration(entry.timing.ttfb)
          }
          theme={theme}
        />
        <KeyValueRow label={strings.duration} value={formatDuration(entry.timing.duration)} theme={theme} />
        <KeyValueRow label={strings.requestSize} value={formatBytes(entry.size.requestBytes)} theme={theme} />
        <KeyValueRow
          label={strings.responseSize}
          value={formatBytes(entry.size.responseBytes)}
          theme={theme}
          last
        />
      </Section>

      {entry.error ? (
        <Section title={strings.errorSection} theme={theme}>
          <KeyValueRow label={strings.errorType} value={entry.error.name ?? '—'} theme={theme} />
          <KeyValueRow label={strings.errorMessage} value={entry.error.message} theme={theme} last />
        </Section>
      ) : null}

      <Section
        title={strings.requestHeaders}
        theme={theme}
        collapsible
        defaultOpen={false}
        count={Object.keys(entry.request.headers).length}
        right={
          <IconButton
            icon="copy-outline"
            label={strings.copyRequestHeaders}
            theme={theme}
            onPress={() => onCopy(formatHeaders(entry.request.headers), strings.copyRequestHeaders)}
          />
        }>
        <HeaderList headers={entry.request.headers} theme={theme} />
      </Section>

      <Section title={strings.requestBody} theme={theme}>
        <BodyBlock body={entry.request.body} theme={theme} />
      </Section>

      <Section
        title={strings.responseHeaders}
        theme={theme}
        collapsible
        defaultOpen={false}
        count={Object.keys(responseHeaders).length}
        right={
          <IconButton
            icon="copy-outline"
            label={strings.copyResponseHeaders}
            theme={theme}
            onPress={() => onCopy(formatHeaders(responseHeaders), strings.copyResponseHeaders)}
          />
        }>
        <HeaderList headers={responseHeaders} theme={theme} />
      </Section>

      <Section
        title={strings.responseBody}
        theme={theme}
        right={
          responseBody ? (
            <IconButton
              icon="copy-outline"
              label={strings.copyResponseBody}
              theme={theme}
              onPress={() => onCopy(responseBody, strings.copyResponseBody)}
            />
          ) : undefined
        }>
        <BodyBlock body={entry.response?.body} theme={theme} />
      </Section>
    </ScrollView>
  );
}

/**
 * Inline label + value, with the copy affordance trailing the row.
 *
 * The value goes through `Mono`, which is what makes the URL wrap by character
 * instead of breaking at `://` / `.` / `/`.
 *
 * Confirmation is the drawer's toast, so nothing is kept local here.
 */
function UrlRow({
  url,
  theme,
  onCopy,
}: {
  url: string;
  theme: InspectorTheme;
  onCopy: CopyHandler;
}) {
  const strings = useStrings();

  return (
    <Pressable
      onPress={() => onCopy(url, strings.copyUrl)}
      accessibilityRole="button"
      accessibilityLabel={`${strings.copyUrl}: ${url}`}
      style={({ pressed }) => [
        styles.urlRow,
        {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.border,
          opacity: pressed ? 0.55 : 1,
        },
      ]}>
      <Text style={[styles.urlLabel, { color: theme.textMuted }]}>URL</Text>
      <Mono theme={theme} style={styles.urlValue}>
        {url}
      </Mono>
      <View style={styles.urlAction}>
        <CopyIcon color={theme.textFaint} />
      </View>
    </Pressable>
  );
}

function HeaderList({ headers, theme }: { headers: Record<string, string>; theme: InspectorTheme }) {
  const strings = useStrings();
  const rows = Object.entries(headers);
  if (rows.length === 0) return <Placeholder theme={theme} text={strings.none} />;

  return (
    <>
      {rows.map(([name, value], index) => (
        <View
          key={name}
          style={[
            styles.headerRow,
            index < rows.length - 1 && {
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: theme.border,
            },
          ]}>
          <Text style={[styles.headerName, { color: theme.text }]}>{name}:</Text>
          <Mono theme={theme} selectable style={styles.headerValue}>
            {value}
          </Mono>
        </View>
      ))}
    </>
  );
}

function BodyBlock({ body, theme }: { body?: BodySnapshot; theme: InspectorTheme }) {
  const strings = useStrings();
  if (!body || body.dropped) return <Placeholder theme={theme} text={strings.none} />;
  if (!body.preview && body.kind !== 'binary' && body.kind !== 'stream') {
    return <Placeholder theme={theme} text={strings.none} />;
  }

  return (
    <View style={styles.bodyBlock}>
      <BodyViewer body={body} theme={theme} />
      {body.truncated ? (
        <Text style={[styles.notice, { color: theme.warning }]}>
          {strings.truncated(formatBytes(body.size))}
        </Text>
      ) : null}
    </View>
  );
}

function Placeholder({ theme, text }: { theme: InspectorTheme; text: string }) {
  return (
    <View style={styles.placeholder}>
      <Text style={[styles.placeholderText, { color: theme.textFaint }]}>{text}</Text>
    </View>
  );
}

function stateLabel(entry: NetworkEntry, strings: InspectorStrings): string {
  switch (entry.state) {
    case 'pending':
      return strings.statePending;
    case 'success':
      return strings.stateSuccess;
    case 'timeout':
      return strings.stateTimeout;
    case 'aborted':
      return strings.stateAborted;
    case 'error':
      return entry.response ? strings.stateFailed : strings.stateNetworkError;
    default:
      return strings.stateUnknown;
  }
}

function formatHeaders(headers: Record<string, string>): string {
  return Object.entries(headers)
    .map(([name, value]) => `${name}: ${value}`)
    .join('\n');
}

/** Inlined to keep the core barrel free of UI-only imports. */
function toCurlCommand(entry: NetworkEntry): string {
  const escape = (value: string) => value.replace(/'/g, `'\\''`);
  const parts = [`curl -X ${entry.request.method} '${escape(entry.request.url)}'`];
  for (const [name, value] of Object.entries(entry.request.headers)) {
    parts.push(`  -H '${escape(name)}: ${escape(value)}'`);
  }
  if (entry.request.body?.preview) {
    parts.push(`  --data-raw '${escape(entry.request.body.preview)}'`);
  }
  return parts.join(' \\\n');
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  flex: {
    flex: 1,
  },
  status: {
    fontSize: 15,
    fontWeight: '600',
  },
  urlRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: 12,
    paddingRight: 14,
    paddingVertical: 9,
    gap: 10,
  },
  urlLabel: {
    width: 68,
    fontSize: 12,
    lineHeight: 17,
  },
  urlValue: {
    flex: 1,
  },
  urlAction: {
    // The icon is right-aligned inside this box, so shrinking it does not move
    // the icon — it just hands the width back to the URL.
    minWidth: 28,
    paddingTop: 1,
    alignItems: 'flex-end',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 9,
    // Tight, so `name:` and its value read as one line rather than two columns.
    gap: 6,
  },
  headerName: {
    // Auto width rather than a fixed column: header names vary a lot
    // (`content-type` vs `x-forwarded-for`), and letting the name size itself is
    // what keeps most pairs on a single line.
    flexShrink: 1,
    // Same size as the value, told apart by weight — the name is the label, the
    // value is the data, and they sit on one line separated by a colon.
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  headerValue: {
    flex: 1,
  },
  bodyBlock: {
    padding: 12,
    gap: 8,
  },
  notice: {
    fontSize: 11.5,
  },
  placeholder: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  placeholderText: {
    fontSize: 12.5,
  },
});
