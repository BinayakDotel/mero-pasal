import { deriveNames } from "@mero-pasal/shared/names";
import { describe, expect, it } from "vitest";
import { errorKey, formOf, isChanged, similarTo } from "./account-edit";

const party = (id: string, name: string) => ({
  _id: id,
  displayName: name,
  phoneticKey: deriveNames(name).phoneticKey,
  lastUsedAt: 0,
});
const ram = { _id: "r", displayName: "Ram Thapa", kind: "customer" as const, tag: "chowk" };

describe("phone account edit (F-07, ADR-036)", () => {
  it("starts from the account; whitespace alone is no change", () => {
    const form = formOf(ram);
    expect(form).toEqual({ name: "Ram Thapa", phone: "", tag: "chowk", kind: "customer" });
    expect(isChanged({ ...form, tag: " chowk " }, ram)).toBe(false);
    expect(isChanged({ ...form, kind: "both" }, ram)).toBe(true);
    expect(isChanged({ ...form, name: "Ram B. Thapa" }, ram)).toBe(true);
  });

  it("warns about a close name, never about itself or an unchanged name", () => {
    const parties = [party("r", "Ram Thapa"), party("s", "राम थापा"), party("h", "Hari")];
    expect(similarTo(formOf(ram), ram, parties)).toEqual([]);
    expect(similarTo({ ...formOf(ram), name: "राम थापा" }, ram, parties).map((p) => p._id)).toEqual(
      ["s"],
    );
    expect(similarTo({ ...formOf(ram), name: "Gopal" }, ram, parties)).toEqual([]);
  });

  it("maps server errors to messages", () => {
    expect(errorKey({ data: { code: "FORBIDDEN" } })).toBe("error.FORBIDDEN");
    expect(errorKey({ data: { code: "WEIRD" } })).toBe("error.unknown");
    expect(errorKey(new Error("x"))).toBe("error.unknown");
  });
});
