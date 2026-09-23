"use client";

// THROWAWAY: the M1 voice spike (product-spec F-24, progress tracker M1, decision OD-5).
// Buwa says 20 real customer names on the Redmi; Binayak marks each result usable or not.
// ≥ 80% usable → F-24 moves into v1.0. Delete this file and its route after the spike.
// Strings are English on purpose: an internal measuring tool, not a product screen
// (documented exception to AGENTS.md rule 6 for the spike only).

import { useCallback, useRef, useState } from "react";

// Chrome ships Web Speech as webkitSpeechRecognition; lib.dom has no types for it.
type Alternative = { transcript: string; confidence: number };
type RecognitionEvent = { results: ArrayLike<ArrayLike<Alternative> & { isFinal: boolean }> };
type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionCtor = new () => Recognition;

function getRecognition(): RecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type Attempt = { id: number; lang: string; heard: string[]; usable: boolean | null; ms: number };
const LANGS = ["ne-NP", "en-IN"] as const;
const TARGET = 20;

// Plain explanations for the Web Speech error codes seen in practice.
const ERROR_HELP: Record<string, string> = {
  network:
    "Couldn't reach Google's speech service. Use Google Chrome (not Brave, Arc, Edge or Chromium), and turn off VPNs or blockers for this page.",
  "not-allowed":
    "Microphone blocked. Allow the microphone for this site in the browser's address bar.",
  "service-not-allowed": "This browser doesn't allow speech recognition here. Use Google Chrome.",
  "audio-capture": "No microphone found. Check that one is connected and not used by another app.",
  "no-speech": "Heard nothing. Tap the mic and speak straight away, a little louder.",
  "language-not-supported": "This language isn't available here. Try the other language button.",
  aborted: "Listening was stopped before a result came back.",
};

export function VoiceSpike() {
  const [lang, setLang] = useState<(typeof LANGS)[number]>("ne-NP");
  const [listening, setListening] = useState(false);
  const [live, setLive] = useState("");
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const startedAt = useRef(0);
  const nextId = useRef(0);

  const listen = useCallback(() => {
    const Ctor = getRecognition();
    if (!Ctor) {
      setError("This browser has no speech recognition. Use Chrome on Android.");
      return;
    }
    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    setError("");
    setLive("");
    startedAt.current = performance.now();
    rec.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      if (!result) return;
      const heard = Array.from(result, (alt) => alt.transcript.trim()).filter(Boolean);
      setLive(heard[0] ?? "");
      if (result.isFinal) {
        const ms = Math.round(performance.now() - startedAt.current);
        const id = nextId.current++;
        setAttempts((prev) => [...prev, { id, lang, heard, usable: null, ms }]);
      }
    };
    rec.onerror = (event) =>
      setError(`${ERROR_HELP[event.error] ?? "Recognition failed."} (error: ${event.error})`);
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  }, [lang]);

  const mark = (id: number, usable: boolean) =>
    setAttempts((prev) => prev.map((a) => (a.id === id ? { ...a, usable } : a)));

  const marked = attempts.filter((a) => a.usable !== null);
  const hits = marked.filter((a) => a.usable).length;
  const rate = marked.length ? Math.round((hits / marked.length) * 100) : 0;
  const report = JSON.stringify({ rate, hits, marked: marked.length, attempts }, null, 2);

  return (
    <main className="mx-auto max-w-[480px] p-4 pb-24">
      <h1 className="font-display text-2xl font-extrabold">Voice spike (F-24)</h1>
      <p className="text-ink-soft">
        Buwa says a customer name after tapping the mic. Mark each result: would this find the right
        person? Target {TARGET} names; ≥ 80% usable pulls voice into v1.0 (OD-5).
      </p>

      <div className="mt-4 flex gap-2">
        {LANGS.map((code) => (
          <button
            key={code}
            type="button"
            aria-pressed={lang === code}
            onClick={() => setLang(code)}
            className={`min-h-12 rounded-full border-2 px-4 font-bold ${lang === code ? "border-ink bg-ink text-white" : "border-rule bg-card"}`}
          >
            {code}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={listen}
        disabled={listening}
        className="mt-4 grid min-h-28 w-full place-items-center rounded-bigbtn bg-bahi font-display text-3xl font-extrabold text-white disabled:opacity-70"
      >
        {listening ? "Listening…" : "🎤 Tap and say a name"}
      </button>
      <p className="mt-3 min-h-10 border-b-2 border-rule text-2xl font-semibold">{live}</p>
      {error ? <p className="mt-2 font-semibold text-bahi">{error}</p> : null}

      <h2 className="mt-6 font-display text-xl font-bold">
        {attempts.length}/{TARGET} tried · {hits}/{marked.length} usable · {rate}%
      </h2>
      <ol className="mt-2 divide-y divide-rule">
        {attempts.map((attempt) => (
          <li key={attempt.id} className="flex items-center gap-2 py-2">
            <span className="flex-1">
              <b className="text-lg">{attempt.heard[0]}</b>
              {attempt.heard.length > 1 ? (
                <span className="block text-[15px] text-ink-soft">
                  also: {attempt.heard.slice(1).join(" · ")}
                </span>
              ) : null}
              <span className="block text-[15px] text-ink-soft">
                {attempt.lang} · {attempt.ms} ms
              </span>
            </span>
            <button
              type="button"
              onClick={() => mark(attempt.id, true)}
              aria-pressed={attempt.usable === true}
              className={`size-12 rounded-full border-2 ${attempt.usable === true ? "border-sale bg-sale text-white" : "border-rule"}`}
            >
              ✓
            </button>
            <button
              type="button"
              onClick={() => mark(attempt.id, false)}
              aria-pressed={attempt.usable === false}
              className={`size-12 rounded-full border-2 ${attempt.usable === false ? "border-bahi bg-bahi text-white" : "border-rule"}`}
            >
              ✗
            </button>
          </li>
        ))}
      </ol>

      {attempts.length ? (
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(report)}
          className="mt-4 min-h-12 w-full rounded-[14px] border-2 border-ink bg-card font-bold"
        >
          Copy results (paste them to Claude)
        </button>
      ) : null}
    </main>
  );
}
