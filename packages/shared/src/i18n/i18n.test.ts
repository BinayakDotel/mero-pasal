/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { en } from "./en";
import { type MessageKey, placeholdersOf, t } from "./i18n";
import { ne } from "./ne";

const keys = Object.keys(ne) as MessageKey[];

describe("dictionaries", () => {
  it("ADR-020: ne and en have exactly the same keys", () => {
    expect(Object.keys(en).sort()).toEqual([...keys].sort());
  });

  it("every message is non-empty in both languages", () => {
    for (const key of keys) {
      expect(ne[key].trim(), `ne ${key}`).not.toBe("");
      expect(en[key].trim(), `en ${key}`).not.toBe("");
    }
  });

  it("ne and en use the same {params} for every key", () => {
    for (const key of keys) {
      expect(placeholdersOf(en[key]), key).toEqual(placeholdersOf(ne[key]));
    }
  });

  it("ui-ux §2.8: Save produces Saved, Remove produces Removed", () => {
    expect(ne["bill.save"]).toContain("राख्नुहोस्");
    expect(ne["bill.saved"]).toBe("राखियो");
    expect(ne["bill.remove"]).toBe("हटाउनुहोस्");
    expect(ne["bill.removed"]).toBe("हटाइयो");
  });
});

describe("t", () => {
  it("F-10: Nepali by default wording, English on request", () => {
    expect(t("ne", "nav.today")).toBe("आज");
    expect(t("en", "nav.today")).toBe("Today");
  });

  it("fills {params}", () => {
    expect(t("ne", "sync.pending", { n: 3 })).toBe("3 पठाउन बाँकी");
    expect(t("en", "party.notFound", { q: "Sunita Rai" })).toBe("No name “Sunita Rai” yet");
  });

  it("checks params at compile time", () => {
    // @ts-expect-error — sync.pending needs { n }
    expect(t("en", "sync.pending")).toBe("{n} waiting to upload");
    // @ts-expect-error — nav.today takes no params
    expect(t("en", "nav.today", { n: 1 })).toBe("Today");
    // @ts-expect-error — wrong param name
    expect(t("en", "party.notFound", { name: "x" })).toBe("No name “{q}” yet");
  });
});

describe("placeholdersOf", () => {
  it("lists param names sorted", () => {
    expect(placeholdersOf("{b} and {a} and {b}")).toEqual(["a", "b", "b"]);
    expect(placeholdersOf("none")).toEqual([]);
  });
});

// The copy deck in ui-ux-context §8 is the reviewed source for wording. Keep it and the
// dictionaries identical so neither drifts.
describe("copy deck (docs/ui-ux-context.md §8)", () => {
  const doc = readFileSync(new URL("../../../../docs/ui-ux-context.md", import.meta.url), "utf8");
  const section = doc.slice(doc.indexOf("## 8. Copy deck"), doc.indexOf("## 9."));
  const deck = new Map<string, { ne: string; en: string }>();
  for (const line of section.split("\n")) {
    const cells = line.split("|").map((cell) => cell.trim());
    const [, keyCell = "", neCell = "", enCell = ""] = cells;
    const rowKeys = [...keyCell.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? "");
    if (rowKeys.length === 0 || keyCell === "Key") continue;
    const neValues = rowKeys.length > 1 ? neCell.split(" / ") : [neCell];
    const enValues = rowKeys.length > 1 ? enCell.split(" / ") : [enCell];
    rowKeys.forEach((key, i) => {
      deck.set(key, { ne: neValues[i] ?? "", en: enValues[i] ?? "" });
    });
  }

  it("parses the deck", () => {
    expect(deck.size).toBeGreaterThan(50);
  });

  it("every dictionary key is in the deck with the same wording", () => {
    for (const key of keys) {
      expect(deck.get(key), `${key} missing from ui-ux §8`).toEqual({ ne: ne[key], en: en[key] });
    }
  });

  it("every deck key exists in the dictionaries", () => {
    for (const key of deck.keys()) expect(keys, key).toContain(key);
  });
});
