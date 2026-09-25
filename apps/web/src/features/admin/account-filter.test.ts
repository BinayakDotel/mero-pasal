import { deriveNames } from "@mero-pasal/shared/names";
import { describe, expect, it } from "vitest";
import { type FilterableAccount, filterAccounts } from "./account-filter";

const account = (name: string, extra: Partial<FilterableAccount> = {}): FilterableAccount => ({
  displayName: name,
  phoneticKey: deriveNames(name).phoneticKey,
  lastUsedAt: 0,
  archived: false,
  ...extra,
});

const ram = account("Ram Bahadur Thapa", { phone: "+977 984-1234567", tag: "Chowk" });
const sita = account("सीता श्रेष्ठ");
const old = account("Hari", { archived: true });
const gone = account("Ram B.", { mergedIntoId: "p1" });
const all = [sita, ram, old, gone];
const base = { query: "", archived: false, merged: false };

describe("accounts filter (F-12)", () => {
  it("hides archived and merged unless asked; sorts by name", () => {
    expect(filterAccounts(all, base)).toEqual([ram, sita]);
    expect(filterAccounts(all, { ...base, archived: true, merged: true })).toHaveLength(4);
  });

  it("finds names in either script, tags, and phones by digits", () => {
    expect(filterAccounts(all, { ...base, query: "राम" })).toEqual([ram]);
    expect(filterAccounts(all, { ...base, query: "sita" })).toEqual([sita]);
    expect(filterAccounts(all, { ...base, query: "chow" })).toEqual([ram]);
    expect(filterAccounts(all, { ...base, query: "1234" })).toEqual([ram]);
    expect(filterAccounts(all, { ...base, query: "984-123" })).toEqual([ram]);
    const block = account("Gopal", { tag: "Block 123" });
    expect(filterAccounts([block, ram], { ...base, query: "block 123" })).toEqual([block]);
    expect(filterAccounts(all, { ...base, query: "hari" })).toEqual([]); // archived
  });
});
