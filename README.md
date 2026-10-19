# @minority/react-native-network-inspector

An in-app network inspector for React Native and Expo. Captures `fetch`, **axios** and any
`XMLHttpRequest` traffic, renders it behind a draggable floating ball, and ships **zero native code** —
so it runs in Expo Go.

![https://raw.githubusercontent.com/Minori-ty/react-native-network-inspector/refs/heads/master/images/1.jpg](https://raw.githubusercontent.com/Minori-ty/react-native-network-inspector/refs/heads/master/images/1.jpg)

![https://raw.githubusercontent.com/Minori-ty/react-native-network-inspector/refs/heads/master/images/2.jpg](https://raw.githubusercontent.com/Minori-ty/react-native-network-inspector/refs/heads/master/images/2.jpg)

```
┌─────────────────────────────────────────────┐
│  业务代码  fetch()  ·  axios                 │
└───────────────────┬─────────────────────────┘
                    │
┌───────────────────▼─────────────────────────┐
│  拦截层  global.fetch  ·  XMLHttpRequest     │
└───────────────────┬─────────────────────────┘
                    │
┌───────────────────▼─────────────────────────┐
│  核心  NetworkEntry · 环形缓冲 · 订阅        │
└───────────────────┬─────────────────────────┘
                    │
┌───────────────────▼─────────────────────────┐
│  UI  悬浮球  ·  全屏抽屉                     │
└─────────────────────────────────────────────┘
```

## Why patching XMLHttpRequest is the whole trick

In React Native:

- `global.fetch` is the **whatwg-fetch polyfill**, which is implemented on top of `XMLHttpRequest`.
- **axios uses the `xhr` adapter** on React Native — there is no `http` adapter available.

So a `global.fetch` patch alone silently misses every axios call. Patching
`XMLHttpRequest.prototype` catches both. This library does that, and adds a `fetch` patch on top
only to capture the richer detail that XHR cannot see (`Request` objects, `init.headers`, a clonable
`Response`).

## Install

```sh
npm install @minority/react-native-network-inspector
```

Peer dependencies: `react`, `react-native`, `@expo/vector-icons`, `expo-clipboard`,
`react-native-gesture-handler`, `react-native-reanimated` and `react-native-safe-area-context`.
All of them ship with most Expo projects already; add any that are missing with
`npx expo install <package>`.

> **Install the peers with `npx expo install`, not `npm install`.** Two of them
> (`expo-clipboard`, `@expo/vector-icons`) carry native code, so the version has to match your
> Expo SDK. `npm install` would take the latest release instead — an SDK 58 module inside an SDK 57
> app fails at startup with `TypeError: property is not writable`. `expo install` picks the version
> your SDK expects.

Icons come from `@expo/vector-icons` (Ionicons) rather than hand-drawn shapes, and the import is a
subpath (`@expo/vector-icons/Ionicons`) so only that one icon set and its font end up in your bundle.

The clipboard is `expo-clipboard`, not React Native's core `Clipboard` — the core one is deprecated
and logs a warning on every access. Both packages are part of Expo Go, so nothing here forces a
development build. Pass `onCopy` if you would rather route copy actions somewhere else.

## Usage

Two steps. Start capture as early as possible, and render the UI near the root.

```tsx
// app/_layout.tsx
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { installNetworkInspector, NetworkInspector } from '@minority/react-native-network-inspector';

installNetworkInspector(); // must run before any request is issued

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* ...your navigator... */}
      <NetworkInspector />
    </GestureHandlerRootView>
  );
}
```

> **`GestureHandlerRootView` is not optional.** Expo Router only mounts one inside its *stack*
> navigator. An app using native tabs (`expo-router/unstable-native-tabs`) never passes through that
> code path, and the floating ball's drag gesture will do nothing without it.

### Configuration

```tsx
installNetworkInspector({
  maxEntries: 500,                          // ring buffer capacity
  byteBudget: 12 * 1024 * 1024,             // total budget for stored body previews
  bodyLimit: 100 * 1024,                    // per-body cap
  redactHeaders: ['authorization', 'cookie'],
  ignore: (url) => url.includes('/health'), // skip noisy endpoints
});
```

`<NetworkInspector />` props:

| prop | default | meaning |
| --- | --- | --- |
| `theme` | follows the system scheme | override the palette |
| `onCopy` | `expo-clipboard` | where copy actions send text; may return a promise |
| `locale` | `'en'` | built-in language: `'en'` or `'zh-CN'` |
| `onLocaleChange` | — | fired when the user flips the in-panel EN/中文 switch; wire to your persistence |
| `messages` | — | override individual strings on top of the locale |
| `defaultOpen` | `false` | start with the drawer open |
| `hideBall` | `false` | keep capturing but hide the ball |

### Language

English is the default; Simplified Chinese ships with the package. Nothing is hardcoded in the
components — every label comes from one `InspectorStrings` object.

```tsx
<NetworkInspector locale="zh-CN" />
```

For a third language, or to reword a single label, override entries. Interpolated labels are
functions, so word order stays yours:

```tsx
<NetworkInspector
  messages={{
    panelTitle: 'Réseau',
    copied: (label) => `${label} copié`,
    keyCount: (count) => `${count} clés`,
  }}
/>
```

`en` and `zhCN` are exported if you would rather build a full bundle by spreading one:

```tsx
import { en, type InspectorStrings } from '@minority/react-native-network-inspector';

const fr: InspectorStrings = { ...en, panelTitle: 'Réseau', /* … */ };
```

### Persisting the choice

The panel ships a built-in **EN / 中文 switch** in its header, so your users change the language
with zero code from you — the example app is deliberately just `<NetworkInspector />`.

The package ships **no** storage dependency, so persisting the choice is the host app's job. Read
the saved value on startup, pass it as `locale`, and write it back through `onLocaleChange` (the
callback the in-panel switch fires). The `locale` prop stays the source of truth, so the panel
re-syncs when you pass the value back and the switch and your stored choice never disagree:

```tsx
// host app — use any store you already have (AsyncStorage, SQLite, MMKV, …)
const [locale, setLocale] = useState<InspectorLocale>(loadSavedLocale());
// …
<NetworkInspector locale={locale} onLocaleChange={setLocale} />
```

### Unread tracking

The ball badge is an **unread counter**, not an error counter, and each list row that is still
unread carries a red `NEW` tag on its top-left corner:

```
new requests arrive   →  badge counts up, rows are tagged NEW
open the panel        →  rows keep their NEW tag
open one entry        →  that row's tag clears
close the panel       →  every tag clears, badge is 0
next request arrives  →  badge starts again at 1
```

The watermark moves on **close**, not on open — advancing it on open would wipe the tags at the
exact moment you opened the panel to look for them. Opening an entry is treated as an explicit
"seen", so it clears that row immediately rather than waiting for the panel to close. Errors are
still surfaced separately: the drawer header shows the failure count, and failed rows are
colour-coded.

### Copy feedback

Every copy action — the URL row (tap anywhere on it), cURL, request/response headers and bodies —
funnels through one handler in the drawer, so all of them raise the same transient toast. Copying is
never silent.

`CopyHandler` may be async. When it returns a promise the toast waits for it, so a failed write
shows "couldn't copy" instead of a success message that isn't true.

## Memory behaviour

A naive "500 entries × 100 KB" cap allows roughly 100 MB of retained bodies. Instead this library
applies two limits together:

1. `maxEntries` — the ring buffer drops the oldest rows entirely.
2. `byteBudget` — once the total stored preview size exceeds the budget, previews are **discarded
   from the oldest entries first while every metadata field is kept**. Those rows show a
   "预览已因内存预算被丢弃" notice instead of disappearing.

Headers are shown verbatim by default. If you opt in via `redactHeaders`, those headers are
redacted *before* truncation, so a token can never survive by being cut in half.

## What it cannot see

This is a pure JavaScript-layer inspector. Out of scope by design:

- `expo/fetch` (SDK 52+) — a native fetch that bypasses XHR entirely
- Images loaded by `expo-image`
- Requests made by native SDKs
- `WebSocket` / SSE

Capturing those needs a native interceptor (`NSURLProtocol` / OkHttp) delivered through a config
plugin, which would rule out Expo Go.

## Caveats worth knowing

- **One request is recorded exactly once.** React Native's `fetch` is whatwg-fetch, which drives an
  `XMLHttpRequest` internally — synchronously, inside its promise executor. Without care, every
  `fetch()` would show up twice (once per patch). The fetch patch wraps its call in
  `withoutXhrCapture()`, which suppresses XHR capture for that synchronous window. If you wrap some
  other XHR-based client yourself, that helper is exported for the same purpose.
- **axios is captured with no extra wiring.** On React Native axios resolves to its `xhr` adapter
  (there is no Node `http` adapter available), so the XHR patch covers it. Entries are labelled
  `source: 'xhr'` — that is accurate, and it is how you tell them apart from `source: 'fetch'`.
- **TTFB is only measured on the XHR path.** The fetch spec exposes no first-byte timing, so rather
  than reporting `duration` twice under a misleading label, the field stays empty for fetch.
- **RN's fetch buffers the whole body** before resolving, so `.clone().text()` adds no extra memory
  beyond what the request already holds. That is also why the reader reads via `text()` rather than a
  stream reader — `TextDecoder` is not guaranteed on Hermes.
- **`responseType: 'blob' | 'arraybuffer'`** responses are recorded by size and MIME type only;
  reading `responseText` on those would throw. Note that whatwg-fetch sets `responseType = 'blob'` on
  its internal XHR, which is one more reason the fetch patch reads the `Response` rather than
  piggy-backing on the XHR entry.
- **The inspector's own requests are not special-cased** — use `ignore` if your panel traffic shows up
  in the list.
- Fast Refresh re-runs `installNetworkInspector()`; a `Symbol` guard makes it idempotent, so globals
  are only patched once.

## Publishing

```sh
cd packages/react-native-net-inspector
npm run typecheck
npm run build      # emits dist/ — this is the artifact that gets published
npm publish
```

The package publishes compiled JavaScript in `dist/` (with `.d.ts` types), not the TypeScript
source, so the published artifact runs in any bundler without the consumer taking a build step.
`dist/` is generated by `npm run build` and is not committed to git.

## License

MIT
