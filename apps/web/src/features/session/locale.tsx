"use client";

import type { Locale } from "@mero-pasal/shared/domain";
import { type MessageKey, type MessageParams, t as translate } from "@mero-pasal/shared/i18n";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

type LocaleValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: <K extends MessageKey>(key: K, ...params: MessageParams<K>) => string;
};

const LocaleContext = createContext<LocaleValue | null>(null);

/**
 * F-10: the active UI language, starting from the member's saved locale; switching saves it
 * back to the member (members.setLocale) so it survives reloads and other devices.
 */
export function LocaleProvider({
  initial,
  onChange,
  children,
}: {
  initial: Locale;
  /** Persists a change (members.setLocale). */
  onChange?: (locale: Locale) => void;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initial);

  useEffect(() => {
    document.documentElement.lang = locale; // ui-ux §9
  }, [locale]);

  const value = useMemo<LocaleValue>(
    () => ({
      locale,
      setLocale: (next) => {
        setLocaleState(next);
        onChange?.(next);
      },
      t: (key, ...params) => translate(locale, key, ...params),
    }),
    [locale, onChange],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used inside <LocaleProvider>");
  return value;
}
