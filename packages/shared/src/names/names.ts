// Name matching across scripts (architecture §7.3, F-04, ADR-012). "Binayak", "Vinayak",
// "binayak", "विनायक" and "बिनायक" must find the same account, and "Ram Bdr" must find
// "Ram Bahadur". Runs on the phone over the cached party list, and on the server to derive keys.

const VIRAMA = "्";
const NUKTA = "़";

const CONSONANTS: Record<string, string> = {
  क: "k",
  ख: "kh",
  ग: "g",
  घ: "gh",
  ङ: "ng",
  च: "ch",
  छ: "chh",
  ज: "j",
  झ: "jh",
  ञ: "n",
  ट: "t",
  ठ: "th",
  ड: "d",
  ढ: "dh",
  ण: "n",
  त: "t",
  थ: "th",
  द: "d",
  ध: "dh",
  न: "n",
  प: "p",
  फ: "ph",
  ब: "b",
  भ: "bh",
  म: "m",
  य: "y",
  र: "r",
  ल: "l",
  व: "b",
  श: "sh",
  ष: "sh",
  स: "s",
  ह: "h",
};
const VOWELS: Record<string, string> = {
  अ: "a",
  आ: "a",
  इ: "i",
  ई: "i",
  उ: "u",
  ऊ: "u",
  ऋ: "ri",
  ए: "e",
  ऐ: "ai",
  ओ: "o",
  औ: "au",
};
const MATRAS: Record<string, string> = {
  "ा": "a",
  "ि": "i",
  "ी": "i",
  "ु": "u",
  "ू": "u",
  "ृ": "ri",
  "े": "e",
  "ै": "ai",
  "ो": "o",
  "ौ": "au",
};
// Anusvara, chandrabindu, visarga.
const SIGNS: Record<string, string> = { "ं": "n", "ँ": "n", "ः": "h" };
const DIGITS = "०१२३४५६७८९";

// architecture §7.3 rule 1.
const ABBREVIATIONS: Record<string, string> = {
  bdr: "bahadur",
  pd: "prasad",
  prd: "prasad",
  kr: "kumar",
  md: "mohammad",
};

const DEVANAGARI = /[ऀ-ॿ]/;

/** True when the text contains any Devanagari. */
export function hasDevanagari(text: string): boolean {
  return DEVANAGARI.test(text);
}

function isDevanagariLetterOrSign(char: string | undefined): boolean {
  return char !== undefined && DEVANAGARI.test(char);
}

/**
 * Devanagari → readable lowercase Latin ("राम बहादुर थापा" → "ram bahadur thapa"). Halant-aware,
 * with word-final schwa deletion as Nepali is spoken. Non-Devanagari text passes through.
 */
export function transliterate(text: string): string {
  const chars = [...text];
  let out = "";
  let pendingA = false; // a consonant's inherent "a", written only if the word continues

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i] as string;
    const next = chars[i + 1];

    if (char === NUKTA) continue; // ड़ reads like ड for matching

    const matra = MATRAS[char];
    if (matra !== undefined) {
      out += matra;
      pendingA = false;
      continue;
    }
    if (char === VIRAMA) {
      pendingA = false;
      continue;
    }

    if (pendingA) out += "a";
    pendingA = false;

    // ज्ञ is said "gy" in Nepali (ज्ञानु → gyanu).
    if (char === "ज" && next === VIRAMA && chars[i + 2] === "ञ") {
      out += "gy";
      i += 2;
      pendingA = true;
    } else if (CONSONANTS[char] !== undefined) {
      out += CONSONANTS[char];
      pendingA = true;
    } else if (VOWELS[char] !== undefined) {
      out += VOWELS[char];
    } else if (SIGNS[char] !== undefined) {
      out += SIGNS[char];
    } else if (DIGITS.includes(char)) {
      out += String(DIGITS.indexOf(char));
    } else {
      out += char;
    }

    // Word-final schwa deletion: राम → ram, not rama.
    if (pendingA && !isDevanagariLetterOrSign(chars[i + 1])) pendingA = false;
  }
  return out;
}

/** Lowercase Latin tokens with abbreviations expanded (architecture §7.3 rules 1–2). */
export function nameTokens(name: string): string[] {
  const latin = hasDevanagari(name) ? transliterate(name) : name;
  return latin
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .split(" ")
    .filter((token) => token !== "")
    .map((token) => ABBREVIATIONS[token] ?? token);
}

const collapse = (text: string) => text.replace(/(.)\1+/g, "$1");

/** Phonetic key of one token (architecture §7.3 rules 3–5): "bahadur" → "bhdr". */
export function tokenKey(token: string): string {
  const merged = collapse(
    token
      .replace(/chh/g, "c")
      .replace(/ch/g, "c")
      .replace(/kh/g, "k")
      .replace(/gh/g, "g")
      .replace(/jh/g, "j")
      .replace(/th/g, "t")
      .replace(/dh/g, "d")
      .replace(/ph/g, "p")
      .replace(/bh/g, "b")
      .replace(/sh/g, "s")
      .replace(/[vw]/g, "b")
      .replace(/z/g, "j")
      .replace(/f/g, "p")
      .replace(/q/g, "k")
      .replace(/x/g, "ks"),
  );
  return collapse(merged.slice(0, 1) + merged.slice(1).replace(/[aeiou]/g, ""));
}

/** The stored `parties.phoneticKey`: one key per token, space-separated. */
export function phoneticKey(name: string): string {
  return nameTokens(name).map(tokenKey).join(" ");
}

function titleCase(text: string): string {
  return text.replace(
    /(^|\s)(\p{L})/gu,
    (_, space: string, letter: string) => space + letter.toUpperCase(),
  );
}

export type DerivedNames = {
  displayName: string;
  nameLatin: string;
  /** Only when the name was typed in Devanagari (Latin → Devanagari is not attempted). */
  nameDevanagari?: string;
  phoneticKey: string;
};

/** F-04: everything the server stores for a newly typed or spoken name. */
export function deriveNames(typed: string): DerivedNames {
  const displayName = typed.trim().replace(/\s+/g, " ");
  const key = phoneticKey(displayName);
  if (hasDevanagari(displayName)) {
    return {
      displayName,
      nameLatin: titleCase(transliterate(displayName)),
      nameDevanagari: displayName,
      phoneticKey: key,
    };
  }
  return { displayName, nameLatin: displayName, phoneticKey: key };
}

/** Optimal-string-alignment Damerau-Levenshtein distance (adjacent swaps cost 1). */
export function editDistance(a: string, b: string): number {
  const cols = b.length + 1;
  // Flat (a.length + 1) × (b.length + 1) table; every index read below is in range.
  const d = new Array<number>((a.length + 1) * cols).fill(0);
  const at = (i: number, j: number) => d[i * cols + j] as number;
  for (let i = 0; i <= a.length; i++) d[i * cols] = i;
  for (let j = 0; j <= b.length; j++) d[j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, at(i - 2, j - 2) + 1);
      }
      d[i * cols + j] = best;
    }
  }
  return at(a.length, b.length);
}

function commonPrefixLength(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/** What matching needs from a party. */
export type Matchable = { phoneticKey: string; lastUsedAt: number };

type Scored<T> = { party: T; allPrefix: boolean; prefix: number; exact: number; distance: number };

/**
 * F-04 search. `matches` ranks: every query token is a key-prefix of some name token → more
 * prefix hits → more exact token hits → smaller edit distance → most recently used.
 * `near` (only when useful) lists names sharing a ≥ 2-letter key start with any query token,
 * for "यीमध्ये कोही हो?" when nothing matches exactly. Short keys like "Rai" (r) never trigger it.
 */
export function searchParties<T extends Matchable>(
  query: string,
  parties: readonly T[],
): { matches: T[]; near: T[] } {
  const queryKeys = nameTokens(query).map(tokenKey);
  if (queryKeys.length === 0) return { matches: [], near: [] };
  const queryFull = queryKeys.join("");
  const fuzzyLimit = queryFull.length >= 6 ? 2 : queryFull.length >= 4 ? 1 : 0;

  const matched: Scored<T>[] = [];
  const near: T[] = [];
  for (const party of parties) {
    const keys = party.phoneticKey.split(" ").filter((key) => key !== "");
    const prefix = queryKeys.filter((q) => keys.some((k) => k.startsWith(q))).length;
    const exact = queryKeys.filter((q) => keys.includes(q)).length;
    const full = keys.join("");
    const distance = Math.min(
      editDistance(queryFull, full),
      editDistance(queryFull, full.slice(0, queryFull.length)),
    );
    const allPrefix = prefix === queryKeys.length;
    if (allPrefix || distance <= fuzzyLimit) {
      matched.push({ party, allPrefix, prefix, exact, distance });
    } else if (
      queryKeys.some((q) => q.length >= 2 && keys.some((k) => commonPrefixLength(q, k) >= 2))
    ) {
      near.push(party);
    }
  }

  matched.sort(
    (a, b) =>
      Number(b.allPrefix) - Number(a.allPrefix) ||
      b.prefix - a.prefix ||
      b.exact - a.exact ||
      a.distance - b.distance ||
      b.party.lastUsedAt - a.party.lastUsedAt,
  );
  near.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  return { matches: matched.map((m) => m.party), near };
}

/** F-04 "उही हो?": existing names close enough to a new one to ask first. */
export function findSimilar<T extends Matchable>(
  name: string,
  parties: readonly T[],
  limit = 3,
): T[] {
  return searchParties(name, parties).matches.slice(0, limit);
}
