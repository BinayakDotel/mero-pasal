import { LOCALES, ROLES, TX_KINDS } from "@mero-pasal/shared/domain";
import { dictionaries } from "@mero-pasal/shared/i18n";
import type { VLiteral, VUnion } from "convex/values";
import { describe, expect, it } from "vitest";
import { ERROR_CODES } from "./lib/errors";
import { locale, role, txKind } from "./schema";

// biome-ignore lint/suspicious/noExplicitAny: test helper reads literal values from any union
const literals = (union: VUnion<any, VLiteral<string>[], "required">) =>
  union.members.map((m) => m.value);

describe("schema validators match @mero-pasal/shared/domain", () => {
  it("ADR-006: transaction kinds", () => {
    expect(literals(txKind)).toEqual([...TX_KINDS]);
  });

  it("roles and locales", () => {
    expect(literals(role).sort()).toEqual([...ROLES].sort());
    expect(literals(locale).sort()).toEqual([...LOCALES].sort());
  });

  it("architecture §6: every error code has i18n text", () => {
    for (const code of ERROR_CODES) expect(Object.keys(dictionaries.ne)).toContain(`error.${code}`);
  });
});
