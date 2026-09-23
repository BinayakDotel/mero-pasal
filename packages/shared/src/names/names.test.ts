import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/names.json";
import {
  deriveNames,
  editDistance,
  findSimilar,
  hasDevanagari,
  nameTokens,
  phoneticKey,
  searchParties,
  tokenKey,
  transliterate,
} from "./names";

type Party = { displayName: string; tag?: string; lastUsedAt: number; phoneticKey: string };
const parties: Party[] = fixture.parties.map((p) => ({
  ...p,
  phoneticKey: phoneticKey(p.displayName),
}));
const names = (list: readonly Party[]) => list.map((p) => p.displayName);

describe("transliterate", () => {
  it("drops the word-final inherent vowel and keeps matras", () => {
    expect(transliterate("राम बहादुर थापा")).toBe("ram bahadur thapa");
    expect(transliterate("कमल")).toBe("kamal");
    expect(transliterate("सीता")).toBe("sita");
  });

  it("is halant-aware: conjuncts have no inherent vowel", () => {
    expect(transliterate("श्रेष्ठ")).toBe("shreshth");
    expect(transliterate("लक्ष्मी")).toBe("lakshmi");
    expect(transliterate("कृष्ण")).toBe("krishn");
  });

  it("reads ज्ञ as gy", () => {
    expect(transliterate("ज्ञानु")).toBe("gyanu");
  });

  it("handles every independent vowel", () => {
    expect(transliterate("अ आ इ ई उ ऊ ऋ ए ऐ ओ औ")).toBe("a a i i u u ri e ai o au");
    expect(transliterate("अनिल")).toBe("anil");
  });

  it("handles every matra", () => {
    expect(transliterate("का कि की कु कू कृ के कै को कौ")).toBe("ka ki ki ku ku kri ke kai ko kau");
  });

  it("handles anusvara, chandrabindu, visarga and nukta", () => {
    expect(transliterate("संजय")).toBe("sanjay");
    expect(transliterate("चाँद")).toBe("chand");
    expect(transliterate("दुःख")).toBe("duhkh");
    expect(transliterate("सड़क")).toBe("sadak");
  });

  it("maps every consonant", () => {
    expect(transliterate("कखगघङ चछजझञ टठडढण तथदधन पफबभम यरलवशषसह")).toBe(
      "kakhagaghang chachhajajhan tathadadhan tathadadhan paphababham yaralabashashasah",
    );
  });

  it("converts Devanagari digits and passes other text through", () => {
    expect(transliterate("१२३ Ram-2")).toBe("123 Ram-2");
    expect(transliterate("")).toBe("");
  });
});

describe("nameTokens / tokenKey / phoneticKey", () => {
  it("lowercases, strips non-letters and expands abbreviations (§7.3 rules 1–2)", () => {
    expect(nameTokens("Ram Bdr. Thapa")).toEqual(["ram", "bahadur", "thapa"]);
    expect(nameTokens("Hari PD  sharma, KR md PRD")).toEqual([
      "hari",
      "prasad",
      "sharma",
      "kumar",
      "mohammad",
      "prasad",
    ]);
    expect(nameTokens("  123 ")).toEqual([]);
  });

  it("merges aspirates and interchangeable letters, collapses, drops later vowels (§7.3 rules 3–5)", () => {
    expect(tokenKey("bahadur")).toBe("bhdr");
    expect(tokenKey("chhetri")).toBe("ctr");
    expect(tokenKey("khadka")).toBe("kdk");
    expect(tokenKey("ghimire")).toBe("gmr");
    expect(tokenKey("jhapa")).toBe("jp");
    expect(tokenKey("dhakal")).toBe("dkl");
    expect(tokenKey("phuyal")).toBe("pyl");
    expect(tokenKey("bhim")).toBe("bm");
    expect(tokenKey("vinayak")).toBe(tokenKey("binayak"));
    expect(tokenKey("wagle")).toBe("bgl");
    expect(tokenKey("zenith")).toBe("jnt");
    expect(tokenKey("farid")).toBe("prd");
    expect(tokenKey("qasim")).toBe("ksm");
    expect(tokenKey("laxmi")).toBe(tokenKey("lakshmi"));
    expect(tokenKey("anil")).toBe("anl");
    expect(tokenKey("ooo")).toBe("o");
  });

  it("gives the same key in both scripts", () => {
    expect(phoneticKey("विनायक")).toBe(phoneticKey("Binayak"));
    expect(phoneticKey("बिनायक")).toBe(phoneticKey("vinayak"));
    expect(phoneticKey("श्रेष्ठ")).toBe(phoneticKey("Shrestha"));
    expect(phoneticKey("राम बहादुर")).toBe(phoneticKey("Ram Bdr"));
    expect(phoneticKey("कृष्ण")).toBe(phoneticKey("Krishna"));
    expect(phoneticKey("ज्ञानु")).toBe(phoneticKey("Gyanu"));
  });
});

describe("hasDevanagari / deriveNames", () => {
  it("detects Devanagari", () => {
    expect(hasDevanagari("राम")).toBe(true);
    expect(hasDevanagari("Ram")).toBe(false);
  });

  it("F-04: a Devanagari name keeps its form and gets a readable Latin one", () => {
    expect(deriveNames("  राम   बहादुर थापा ")).toEqual({
      displayName: "राम बहादुर थापा",
      nameLatin: "Ram Bahadur Thapa",
      nameDevanagari: "राम बहादुर थापा",
      phoneticKey: "rm bhdr tp",
    });
  });

  it("F-04: a Latin name is stored as typed, with no Devanagari guess", () => {
    expect(deriveNames("Sunita  Rai")).toEqual({
      displayName: "Sunita Rai",
      nameLatin: "Sunita Rai",
      phoneticKey: "snt r",
    });
  });
});

describe("editDistance", () => {
  it("counts insertions, deletions, substitutions and adjacent swaps", () => {
    expect(editDistance("", "")).toBe(0);
    expect(editDistance("abc", "")).toBe(3);
    expect(editDistance("", "ab")).toBe(2);
    expect(editDistance("srsj", "srsl")).toBe(1);
    expect(editDistance("ab", "ba")).toBe(1);
    expect(editDistance("bnyk", "bnyk")).toBe(0);
    expect(editDistance("kitten", "sitting")).toBe(3);
  });
});

describe("searchParties (F-04)", () => {
  it.each(fixture.queries)(
    "F-04 acceptance: “$query” finds “$expect” in the top 3",
    ({ query, expect: want }) => {
      expect(names(searchParties(query, parties).matches.slice(0, 3))).toContain(want);
    },
  );

  it("returns nothing for an empty query", () => {
    expect(searchParties("", parties)).toEqual({ matches: [], near: [] });
    expect(searchParties(" ?? ", parties)).toEqual({ matches: [], near: [] });
  });

  it("prefers a first-token match, then recency", () => {
    // "kri" prefixes Krishna, Karki, कोइराला and कार्की; the first-token Krishnas rank first.
    expect(names(searchParties("kri", parties).matches.slice(0, 2)).sort()).toEqual(
      ["Krishna Karki", "कृष्ण बहादुर खड्का"].sort(),
    );
  });

  it("ties break by most recently used", () => {
    const [a, b] = searchParties("ram bdr", parties).matches;
    expect(a?.displayName).toBe("राम बहादुर थापा"); // used an hour before the Latin one
    expect(b?.displayName).toBe("Ram Bahadur Thapa");
  });

  it("tolerates a one-letter typo in a longer name", () => {
    expect(names(searchParties("suresj", parties).matches)).toContain("Suresh Lamichhane");
  });

  it("F-04: suggests near matches only when nothing fully matches", () => {
    const { matches, near } = searchParties("gopal thapa", parties);
    expect(matches).toEqual([]);
    expect(names(near)).toEqual(
      expect.arrayContaining(["Gopal Shrestha", "गोपाल महर्जन", "राम बहादुर थापा"]),
    );
  });

  it("architecture §7.3: a one-letter key like Rai never makes a near match", () => {
    const { matches, near } = searchParties("sabin rai", parties);
    expect(matches).toEqual([]);
    expect(names(near)).toContain("Bikash Subedi"); // sbn ~ sbd share two letters
    expect(names(near)).not.toContain("कमल राई");
    expect(names(near)).not.toContain("Sunita Rai");
  });

  it("near matches are ordered by recency", () => {
    const { near } = searchParties("gopak", parties);
    expect(names(near)).toEqual(["गोपाल महर्जन", "Gopal Shrestha"]);
  });
});

describe("findSimilar (F-04 “उही हो?”)", () => {
  it("UC-04: “राम ब थापा” finds both Ram Bahadur Thapas", () => {
    expect(names(findSimilar("राम ब थापा", parties)).sort()).toEqual(
      ["Ram Bahadur Thapa", "राम बहादुर थापा"].sort(),
    );
  });

  it("returns at most `limit` names and nothing for a new name", () => {
    expect(findSimilar("sita", parties, 1)).toHaveLength(1);
    expect(findSimilar("Zzyzx Qwerty", parties)).toEqual([]);
  });
});
