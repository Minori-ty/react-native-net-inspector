import { createContext, useContext, type ReactNode } from 'react';

import { en, type InspectorStrings } from '../i18n';

/**
 * The panel is deep — drawer → detail → body viewer — and every one of those
 * layers renders text. Threading a `strings` prop through each of them would
 * touch every signature for no gain, so the resolved bundle travels in context.
 *
 * Defaults to English so a component rendered outside `<NetworkInspector>`
 * (a storybook, a test) still has something to print.
 */
const StringsContext = createContext<InspectorStrings>(en);

export function StringsProvider({
  strings,
  children,
}: {
  strings: InspectorStrings;
  children: ReactNode;
}) {
  return <StringsContext.Provider value={strings}>{children}</StringsContext.Provider>;
}

export function useStrings(): InspectorStrings {
  return useContext(StringsContext);
}
