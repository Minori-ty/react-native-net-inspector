import Ionicons from '@expo/vector-icons/Ionicons';
import CodeHighlighter from 'react-native-code-highlighter';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { atomOneDark, atomOneLight } from 'react-syntax-highlighter/dist/esm/styles/hljs';

import type { InspectorStrings } from '../i18n';
import type { InspectorTheme } from '../theme';
import type { BodySnapshot } from '../types';
import { MONO_FONT, Mono } from './primitives';
import { useStrings } from './strings-context';

/**
 * Above this many characters the JS thread would spend too long tokenising
 * (highlight.js) or laying out rows, so bodies past it render as plain text.
 */
const HIGHLIGHT_LIMIT = 20_000;

/** Horizontal offset per nesting level, in px. */
const INDENT = 14;

/** Path of the root node. Children extend it as `$/key`, JSON-Pointer style. */
const ROOT_PATH = '$';

type JsonContainer = Record<string, unknown> | unknown[];

/**
 * Raw text for clipboard actions — the pretty JSON form when the preview parses,
 * the raw preview otherwise. Binary and stream bodies copy nothing.
 */
export function bodyCopyText(body?: BodySnapshot): string {
  if (!body || body.dropped) return '';
  if (!body.preview) return '';
  const parsed = tryParseJson(body.preview);
  if (parsed !== undefined) return JSON.stringify(parsed, null, 2);
  return body.preview;
}

/**
 * The visual for a captured body: a collapsible tree for JSON, a highlighted
 * block for text, and an inert label for binary / stream payloads.
 *
 * The tree is built here rather than taken from a package: the two React Native
 * JSON viewers on npm are `react-native-json-tree` (its own row rhythm and
 * colours, which do not match this panel) and `react-native-json-view` (ESM-only,
 * which throws while initialising under Metro + Hermes and takes the host app
 * down with it). Neither is a safe dependency for a dev tool.
 *
 * `body` is expected to carry something to show; the caller decides whether an
 * empty body renders a placeholder instead.
 */
export function BodyViewer({ body, theme }: { body: BodySnapshot; theme: InspectorTheme }) {
  const strings = useStrings();
  const { preview } = body;
  const parsedJson = useMemo(
    () => (preview && body.kind === 'json' ? tryParseJson(preview) : undefined),
    [preview, body.kind],
  );

  if (preview) {
    const tooLarge = preview.length > HIGHLIGHT_LIMIT;

    if (!tooLarge && parsedJson !== undefined) {
      // Keyed by the body: the detail screen swaps `entry` without remounting,
      // and fold state lives inside the tree — without a new key the previous
      // payload's collapsed nodes would carry over.
      return <JsonTree key={preview} value={parsedJson} theme={theme} />;
    }

    const language = highlightLanguage(body);
    if (!tooLarge && language !== null) {
      return (
        <CodeHighlighter
          hljsStyle={theme.scheme === 'dark' ? atomOneDark : atomOneLight}
          language={language}
          scrollViewProps={{ contentContainerStyle: styles.codeContent }}>
          {preview}
        </CodeHighlighter>
      );
    }

    return <Mono theme={theme} selectable>{preview}</Mono>;
  }

  // Binary and stream bodies carry no text preview — describe them by kind.
  if (body.kind === 'binary') return <Mono theme={theme} selectable>{strings.binaryBody}</Mono>;
  if (body.kind === 'stream') return <Mono theme={theme} selectable>{strings.streamBody}</Mono>;
  return null;
}

/**
 * The fold state lives here as a set of collapsed paths: everything not in the
 * set is open, so a fresh body only needs to remember the few nodes the reader
 * closed instead of materialising a flag for every node.
 *
 * It starts empty — fully expanded — so a request or response body's JSON is
 * readable at a glance on open. The "Collapse all" toolbar button collapses
 * every container at once when the payload is large.
 */
function JsonTree({ value, theme }: { value: JsonContainer; theme: InspectorTheme }) {
  const strings = useStrings();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  const toggle = useCallback((path: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const rows = useMemo(
    () => renderContainer(value, ROOT_PATH, 1, collapsed, toggle, theme, strings),
    [value, collapsed, theme, toggle, strings],
  );

  // Nothing to fold means the toolbar would be dead weight.
  const foldable = useMemo(() => hasFoldableChild(value), [value]);

  const isArray = Array.isArray(value);
  const size = entriesOf(value).length;
  const rootOpen = !collapsed.has(ROOT_PATH);

  return (
    <View>
      {foldable ? (
        <View style={styles.toolbar}>
          <ToolButton label={strings.expandAll} theme={theme} onPress={() => setCollapsed(new Set())} />
          <ToolButton
            label={strings.collapseAll}
            theme={theme}
            onPress={() => setCollapsed(allContainers(value))}
          />
        </View>
      ) : null}

      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        style={[styles.tree, { backgroundColor: theme.surfaceAlt }]}
        contentContainerStyle={styles.treeContent}>
        <View>
          {size === 0 ? (
            // An empty root still deserves a shape, not a blank box.
            <RootRow theme={theme}>
              <Text>{isArray ? '[]' : '{}'}</Text>
            </RootRow>
          ) : (
            <>
              <Pressable
                onPress={() => toggle(ROOT_PATH)}
                accessibilityRole="button"
                accessibilityLabel={rootOpen ? strings.collapseAll : strings.expandAll}
                accessibilityState={{ expanded: rootOpen }}
                style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
                <View style={styles.caret}>
                  <Ionicons
                    name={rootOpen ? 'chevron-down' : 'chevron-forward'}
                    size={12}
                    color={theme.textFaint}
                  />
                </View>
                <Text style={[styles.line, { color: theme.text }]}>
                  {rootOpen ? (
                    <Text>{isArray ? '[' : '{'}</Text>
                  ) : (
                    <CollapsedSummary isArray={isArray} size={size} theme={theme} strings={strings} />
                  )}
                </Text>
              </Pressable>

              {rootOpen ? (
                <>
                  {rows}
                  <RootRow theme={theme}>
                    <Text>{isArray ? ']' : '}'}</Text>
                  </RootRow>
                </>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/** A row with no key of its own — the root's opening and closing bracket. */
function RootRow({ children, theme }: { children: ReactNode; theme: InspectorTheme }) {
  return (
    <View style={styles.row}>
      <View style={styles.caret} />
      <Text style={[styles.line, { color: theme.text }]}>{children}</Text>
    </View>
  );
}

function renderContainer(
  container: JsonContainer,
  path: string,
  depth: number,
  collapsed: ReadonlySet<string>,
  toggle: (path: string) => void,
  theme: InspectorTheme,
  strings: InspectorStrings,
): ReactNode[] {
  const isArray = Array.isArray(container);
  return entriesOf(container).flatMap(([key, child]) =>
    renderEntry({
      key,
      // Array indices are positional noise — bare and muted, so object keys
      // stand out. Object keys keep their quotes, as they would in the source.
      keyLabel: isArray ? key : JSON.stringify(key),
      keyColor: isArray ? theme.textMuted : theme.accent,
      value: child,
      path: childPath(path, key),
      depth,
      collapsed,
      toggle,
      theme,
      strings,
    }),
  );
}

function renderEntry({
  key,
  keyLabel,
  value,
  path,
  depth,
  keyColor,
  collapsed,
  toggle,
  theme,
  strings,
}: {
  key: string;
  keyLabel: string;
  value: unknown;
  path: string;
  depth: number;
  keyColor: string;
  collapsed: ReadonlySet<string>;
  toggle: (path: string) => void;
  theme: InspectorTheme;
  strings: InspectorStrings;
}): ReactNode[] {
  const container = isContainer(value);
  const isArray = Array.isArray(value);
  const size = container ? entriesOf(value).length : 0;
  const foldable = container && size > 0;
  const open = !foldable || !collapsed.has(path);

  const rowStyle = [styles.row, { paddingLeft: depth * INDENT }];
  const line = (
    <>
      <View style={styles.caret}>
        {foldable ? (
          <Ionicons
            name={open ? 'chevron-down' : 'chevron-forward'}
            size={12}
            color={theme.textFaint}
          />
        ) : null}
      </View>

      <Text style={[styles.line, { color: theme.text }]}>
        <Text style={{ color: keyColor }}>{keyLabel}</Text>
        <Text style={{ color: theme.textMuted }}>{': '}</Text>
        {container && size === 0 ? (
          // `{}` / `[]` close on the same line — there is nothing to unfold.
          <Text>{isArray ? '[]' : '{}'}</Text>
        ) : foldable && !open ? (
          <CollapsedSummary isArray={isArray} size={size} theme={theme} strings={strings} />
        ) : container ? (
          <Text>{isArray ? '[' : '{'}</Text>
        ) : (
          <Primitive value={value} theme={theme} />
        )}
      </Text>
    </>
  );

  // The whole row is the hit target, not just the 12px chevron: a folded
  // `{…}` invites a tap, and tapping it and having nothing happen reads as
  // broken. Rows that cannot fold stay inert so text drags still work.
  const rows: ReactNode[] = [
    foldable ? (
      <Pressable
        key={path}
        onPress={() => toggle(path)}
        accessibilityRole="button"
        accessibilityLabel={`${open ? strings.collapse : strings.expand} ${key}`}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [rowStyle, { opacity: pressed ? 0.6 : 1 }]}>
        {line}
      </Pressable>
    ) : (
      <View key={path} style={rowStyle}>
        {line}
      </View>
    ),
  ];

  if (foldable && open) {
    rows.push(...renderContainer(value, path, depth + 1, collapsed, toggle, theme, strings));
    rows.push(
      <View key={`${path}:close`} style={[styles.row, { paddingLeft: depth * INDENT }]}>
        <View style={styles.caret} />
        <Text style={[styles.line, { color: theme.text }]}>{isArray ? ']' : '}'}</Text>
      </View>,
    );
  }

  return rows;
}

/** `{…} 4 keys` — folded, but the size still tells you whether to open it. */
function CollapsedSummary({
  isArray,
  size,
  theme,
  strings,
}: {
  isArray: boolean;
  size: number;
  theme: InspectorTheme;
  strings: InspectorStrings;
}) {
  return (
    <>
      <Text>{isArray ? '[' : '{'}</Text>
      <Text style={{ color: theme.textFaint }}>…</Text>
      <Text>{isArray ? ']' : '}'}</Text>
      <Text style={{ color: theme.textFaint }}>
        {`  ${isArray ? strings.itemCount(size) : strings.keyCount(size)}`}
      </Text>
    </>
  );
}

function Primitive({ value, theme }: { value: unknown; theme: InspectorTheme }) {
  if (typeof value === 'string') {
    return <Text style={{ color: theme.success }}>{JSON.stringify(value)}</Text>;
  }
  if (typeof value === 'number') {
    return <Text style={{ color: theme.warning }}>{String(value)}</Text>;
  }
  // `true` / `false` / `null` — muted, so the data reads louder than the keywords.
  return <Text style={{ color: theme.textMuted }}>{String(value)}</Text>;
}

function ToolButton({
  label,
  onPress,
  theme,
}: {
  label: string;
  onPress: () => void;
  theme: InspectorTheme;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
      <Text style={[styles.toolLabel, { color: theme.textMuted }]}>{label}</Text>
    </Pressable>
  );
}

function isContainer(value: unknown): value is JsonContainer {
  return value !== null && typeof value === 'object';
}

function entriesOf(container: JsonContainer): Array<[string, unknown]> {
  return Array.isArray(container)
    ? container.map((item, index): [string, unknown] => [String(index), item])
    : Object.entries(container);
}

/**
 * JSON Pointer escaping, so a key containing `/` or `~` cannot alias another
 * node's path — and therefore cannot share its fold state.
 */
function childPath(path: string, key: string): string {
  return `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;
}

/** Every foldable container except the root — the initial state, and "collapse all". */
function allContainers(root: JsonContainer): Set<string> {
  const paths = new Set<string>();

  const visit = (container: JsonContainer, path: string) => {
    for (const [key, child] of entriesOf(container)) {
      if (!isContainer(child)) continue;

      const nextPath = childPath(path, key);
      if (entriesOf(child).length > 0) paths.add(nextPath);
      visit(child, nextPath);
    }
  };

  visit(root, ROOT_PATH);
  return paths;
}

function hasFoldableChild(root: JsonContainer): boolean {
  return entriesOf(root).some(([, child]) => isContainer(child) && entriesOf(child).length > 0);
}

function tryParseJson(text: string): JsonContainer | undefined {
  try {
    const value = JSON.parse(text);
    if (value === null || typeof value !== 'object') return undefined;
    return value as JsonContainer;
  } catch {
    return undefined;
  }
}

/** Maps a body to an highlight.js language, or `null` for plain text. */
function highlightLanguage(body: BodySnapshot): string | null {
  if (body.kind === 'json') return 'json';
  const mime = (body.mimeType ?? '').toLowerCase();
  if (mime.includes('json')) return 'json';
  if (mime.includes('html')) return 'xml';
  if (mime.includes('xml')) return 'xml';
  if (mime.includes('javascript') || mime.includes('ecmascript')) return 'javascript';
  if (mime.includes('css')) return 'css';
  return null;
}

const styles = StyleSheet.create({
  codeContent: {
    padding: 12,
    borderRadius: 8,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 14,
    marginBottom: 8,
  },
  toolLabel: {
    fontSize: 11.5,
    fontWeight: '500',
  },
  tree: {
    borderRadius: 8,
  },
  treeContent: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  caret: {
    // Fixed box: the chevron sits on the first line of the row and every
    // sibling's text starts at the same column whether or not it can fold.
    width: 16,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: {
    fontFamily: MONO_FONT,
    fontSize: 12,
    lineHeight: 18,
  },
});
