import { networkStore, type NetworkStore } from '../core/store';
import type { InspectorConfig } from '../types';
import { patchFetch } from './fetch';
import { patchXhr } from './xhr';

const INSTALL_KEY = Symbol.for('react-native-net-inspector.installed');

export interface InstallOptions extends Partial<InspectorConfig> {
  /** Capture into a different store than the shared singleton. */
  store?: NetworkStore;
}

/**
 * Installs the fetch and XHR patches. Idempotent — call it as often as you like
 * (Fast Refresh will), only the first call actually patches globals.
 *
 * Must run before any request is issued. The app root layout's module scope is
 * early enough for everything except module-level requests in modules that are
 * imported even earlier.
 *
 * @returns an uninstall function that restores the original globals.
 */
export function installNetworkInspector(options: InstallOptions = {}): () => void {
  const { store = networkStore, ...config } = options;
  if (Object.keys(config).length > 0) store.configure(config);

  const scope = globalThis as unknown as Record<symbol, unknown>;
  const existing = scope[INSTALL_KEY];
  if (typeof existing === 'function') return existing as () => void;

  const restore = [patchFetch(store), patchXhr(store)];
  let undone = false;

  const uninstall = () => {
    // Idempotent: a second call must not clobber globals that a later install
    // may have replaced in the meantime.
    if (undone) return;
    undone = true;
    for (const undo of restore) undo();
    if (scope[INSTALL_KEY] === uninstall) scope[INSTALL_KEY] = undefined;
  };

  scope[INSTALL_KEY] = uninstall;
  return uninstall;
}

export function uninstallNetworkInspector(): void {
  const scope = globalThis as unknown as Record<symbol, unknown>;
  const existing = scope[INSTALL_KEY];
  if (typeof existing === 'function') (existing as () => void)();
}
