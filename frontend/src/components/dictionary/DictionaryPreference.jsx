import { createContext, useContext, useState } from "react";

const STORAGE_KEY = "frauliu:dictionary-enabled";
const DictionaryPreferenceContext = createContext({ enabled: true });

export function DictionaryPreferenceProvider({ children }) {
  const [enabled, setEnabled] = useState(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) !== "false";
    } catch {
      return true;
    }
  });

  function toggle() {
    const nextEnabled = !enabled;
    setEnabled(nextEnabled);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(nextEnabled));
    } catch {
      // The switch still works in the current layout when storage is unavailable.
    }
  }

  return (
    <DictionaryPreferenceContext.Provider value={{ enabled, toggle }}>
      {children}
    </DictionaryPreferenceContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDictionaryPreference() {
  return useContext(DictionaryPreferenceContext);
}
