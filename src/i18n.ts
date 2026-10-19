/**
 * Every string the panel renders, in one place.
 *
 * The package ships English (the default) and Simplified Chinese. Pass `locale`
 * to pick one, or `messages` to override individual entries — useful for a third
 * language, or for rewording a label without forking the package.
 *
 * Entries that interpolate take arguments rather than exposing placeholders:
 * word order differs between languages, and a template string in the caller
 * would freeze it.
 */
export interface InspectorStrings {
  // Panel chrome
  panelTitle: string;
  back: string;
  clear: string;
  close: string;
  /** Appended to the count in the header when some requests failed. */
  failedSuffix: (count: number) => string;
  emptyNoRequests: string;
  emptyNoMatches: string;
  onlyFailed: string;
  searchPlaceholder: string;
  copied: (label: string) => string;
  copyFailed: (label: string) => string;
  /** Screen-reader label for a row captured since the panel was last closed. */
  newRequest: (method: string, path: string) => string;

  // Detail — sections
  overview: string;
  timing: string;
  errorSection: string;
  requestHeaders: string;
  requestBody: string;
  responseHeaders: string;
  responseBody: string;

  // Detail — rows
  source: string;
  startedAt: string;
  status: string;
  ttfb: string;
  ttfbUnavailable: string;
  duration: string;
  requestSize: string;
  responseSize: string;
  errorType: string;
  errorMessage: string;
  none: string;
  truncated: (size: string) => string;

  // Detail — copy actions (also used as the label in the confirmation toast)
  copyCurl: string;
  copyUrl: string;
  copyRequestHeaders: string;
  copyResponseHeaders: string;
  copyResponseBody: string;

  // Request states
  statePending: string;
  stateSuccess: string;
  stateTimeout: string;
  stateAborted: string;
  stateFailed: string;
  stateNetworkError: string;
  stateUnknown: string;

  // Body viewer
  binaryBody: string;
  streamBody: string;
  expand: string;
  collapse: string;
  expandAll: string;
  collapseAll: string;
  itemCount: (count: number) => string;
  keyCount: (count: number) => string;
}

export type InspectorLocale = 'en' | 'zh-CN';

export const en: InspectorStrings = {
  panelTitle: 'Network',
  back: 'Back',
  clear: 'Clear',
  close: 'Close',
  failedSuffix: (count) => ` · ${count} failed`,
  emptyNoRequests: 'No requests captured yet.\nFire a fetch or axios call to see one here.',
  emptyNoMatches: 'Nothing matches the current filters.',
  onlyFailed: 'Failed only',
  searchPlaceholder: 'Search URL',
  copied: (label) => `${label} copied`,
  copyFailed: (label) => `Couldn't copy ${label}`,
  newRequest: (method, path) => `${method} ${path}, new request`,

  overview: 'Overview',
  timing: 'Timing & size',
  errorSection: 'Error',
  requestHeaders: 'Request headers',
  requestBody: 'Request body',
  responseHeaders: 'Response headers',
  responseBody: 'Response body',

  source: 'Source',
  startedAt: 'Started',
  status: 'Status',
  ttfb: 'TTFB',
  ttfbUnavailable: '— (not exposed by fetch)',
  duration: 'Duration',
  requestSize: 'Request size',
  responseSize: 'Response size',
  errorType: 'Type',
  errorMessage: 'Message',
  none: 'None',
  truncated: (size) => `Truncated, original size ${size}`,

  copyCurl: 'Copy cURL',
  copyUrl: 'URL',
  copyRequestHeaders: 'Request headers',
  copyResponseHeaders: 'Response headers',
  copyResponseBody: 'Response body',

  statePending: 'In flight',
  stateSuccess: 'Success',
  stateTimeout: 'Timed out',
  stateAborted: 'Aborted',
  stateFailed: 'Failed',
  stateNetworkError: 'Network error',
  stateUnknown: 'Unknown',

  binaryBody: '(binary body, not shown)',
  streamBody: '(streaming body, not shown)',
  expand: 'Expand',
  collapse: 'Collapse',
  expandAll: 'Expand all',
  collapseAll: 'Collapse all',
  itemCount: (count) => `${count} items`,
  keyCount: (count) => `${count} keys`,
};

export const zhCN: InspectorStrings = {
  panelTitle: '网络',
  back: '返回',
  clear: '清空',
  close: '关闭',
  failedSuffix: (count) => ` · ${count} 失败`,
  emptyNoRequests: '还没有捕获到请求。\n发一个 fetch 或 axios 请求试试。',
  emptyNoMatches: '没有符合当前筛选条件的请求。',
  onlyFailed: '只看失败',
  searchPlaceholder: '搜索 URL',
  copied: (label) => `${label} 已复制`,
  copyFailed: (label) => `${label} 复制失败`,
  newRequest: (method, path) => `${method} ${path}，新请求`,

  overview: '概览',
  timing: '耗时与大小',
  errorSection: '错误',
  requestHeaders: '请求头',
  requestBody: '请求体',
  responseHeaders: '响应头',
  responseBody: '响应体',

  source: '来源',
  startedAt: '开始时间',
  status: '状态',
  ttfb: '首字节',
  ttfbUnavailable: '—（fetch 不提供）',
  duration: '总耗时',
  requestSize: '请求大小',
  responseSize: '响应大小',
  errorType: '类型',
  errorMessage: '信息',
  none: '无',
  truncated: (size) => `已截断，原始大小 ${size}`,

  copyCurl: '复制 cURL',
  copyUrl: 'URL',
  copyRequestHeaders: '请求头',
  copyResponseHeaders: '响应头',
  copyResponseBody: '响应体',

  statePending: '进行中',
  stateSuccess: '成功',
  stateTimeout: '超时',
  stateAborted: '已中断',
  stateFailed: '失败',
  stateNetworkError: '网络错误',
  stateUnknown: '未知',

  binaryBody: '（二进制内容，不展示）',
  streamBody: '（流式内容，不展示）',
  expand: '展开',
  collapse: '收起',
  expandAll: '全部展开',
  collapseAll: '全部收起',
  itemCount: (count) => `${count} 项`,
  keyCount: (count) => `${count} 个键`,
};

const BUNDLED: Record<InspectorLocale, InspectorStrings> = { en, 'zh-CN': zhCN };

/** The strings for a locale, with any per-entry overrides applied on top. */
export function resolveStrings(
  locale: InspectorLocale = 'en',
  overrides?: Partial<InspectorStrings>,
): InspectorStrings {
  const base = BUNDLED[locale] ?? en;
  return overrides ? { ...base, ...overrides } : base;
}
