import type { Locale } from "../domain/domain";
import { en } from "./en";
import { ne } from "./ne";

export type { Locale };
export type MessageKey = keyof typeof ne;

/** The `{param}` names used in a message template, as a union (`never` if none). */
type ParamNames<S extends string> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | ParamNames<Rest>
  : never;

/** Params for a key: required and exactly named when the Nepali template has placeholders. */
export type MessageParams<K extends MessageKey> = [ParamNames<(typeof ne)[K]>] extends [never]
  ? []
  : [params: Record<ParamNames<(typeof ne)[K]>, string | number>];

export const dictionaries: { readonly [L in Locale]: { readonly [K in MessageKey]: string } } = {
  ne,
  en,
};

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Looks up a UI string (F-10: every user-facing string goes through this). Parameters are
 * checked at compile time: `t("ne", "sync.pending", { n: 3 })` → "3 पठाउन बाँकी".
 */
export function t<K extends MessageKey>(
  locale: Locale,
  key: K,
  ...[params]: MessageParams<K>
): string {
  const template = dictionaries[locale][key];
  if (!params) return template;
  const values: Record<string, string | number> = params;
  return template.replace(PLACEHOLDER, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

/** The `{param}` names in a template, sorted; used to check that ne and en agree. */
export function placeholdersOf(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER)].map((m) => m[1] ?? "").sort();
}
