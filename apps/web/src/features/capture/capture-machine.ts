import { type BillKind, MAX_BILL_PAGES } from "@mero-pasal/shared/domain";
import type { NumPadKey } from "@mero-pasal/ui/components/num-pad";
import { backspace, pressKey } from "./amount-entry";

// F-03 capture flow as an explicit state machine (code-standard §5): photo → preview → party →
// amount → saving → saved. Saving arrives in M1 PR 11; draft restore after a tab kill in M2.

/** One photographed page. `url` is an object URL owned by the capture provider. */
export type Page = { id: string; file: Blob; url: string };

/** Who the bill is for (F-04). `later` = saved without a name, flagged for admin review. */
export type PartyChoice =
  | { type: "existing"; id: string; displayName: string; isWalkIn: boolean }
  | { type: "new"; clientId: string; displayName: string; phone?: string; tag?: string }
  /** A name added earlier on this phone that hasn't reached the server yet (F-04 offline). */
  | { type: "local"; clientId: string; displayName: string }
  | { type: "later" };

type Draft = {
  kind: BillKind;
  /** Idempotency key for the eventual bill (architecture §5.3 invariant 2). Made at the first photo. */
  clientId: string;
  pages: Page[];
  startedAt: number;
  /** Rupees as typed on the pad ("" = no amount yet). Kept when stepping back and forth. */
  digits: string;
  /** F-05: the bill date; null = today in NPT, decided when saving. */
  dateBs: string | null;
};

export type CaptureState =
  | { step: "idle" }
  | (Draft & { step: "preview"; viewing: number })
  | (Draft & { step: "party"; party?: PartyChoice })
  | (Draft & { step: "amount"; party: PartyChoice })
  | (Draft & { step: "saving"; party: PartyChoice })
  | (Draft & { step: "saved"; party: PartyChoice });

export type CaptureEvent =
  | { type: "start"; kind: BillKind; clientId: string; page: Page; now: number }
  | { type: "view"; index: number }
  | { type: "retake"; page: Page }
  | { type: "addPage"; page: Page }
  | { type: "usePhotos" }
  | { type: "pickParty"; party: PartyChoice }
  | { type: "amountKey"; key: NumPadKey }
  | { type: "amountBackspace" }
  | { type: "amountClear" }
  | { type: "setDate"; dateBs: string | null }
  | { type: "saveStart" }
  | { type: "saveFailed" }
  | { type: "saved" }
  /** F-03 draft restore: continue an unfinished bill from the phone's storage. */
  | { type: "restore"; state: Exclude<CaptureState, { step: "idle" | "saving" | "saved" }> }
  | { type: "back" }
  | { type: "reset" };

export const initialCapture: CaptureState = { step: "idle" };

/** The step counter shown in the top bar ("१/३"). */
export const STEP_NUMBER = { preview: 1, party: 2, amount: 3 } as const;
export const STEP_TOTAL = 3;

export function canAddPage(state: CaptureState): boolean {
  return state.step === "preview" && state.pages.length < MAX_BILL_PAGES;
}

/** Pages that are no longer part of the draft after an event (their object URLs can be freed). */
export function droppedPages(before: CaptureState, after: CaptureState): Page[] {
  const kept = new Set(after.step === "idle" ? [] : after.pages.map((p) => p.id));
  return before.step === "idle" ? [] : before.pages.filter((p) => !kept.has(p.id));
}

export function captureReducer(state: CaptureState, event: CaptureEvent): CaptureState {
  switch (event.type) {
    case "start":
      return {
        step: "preview",
        kind: event.kind,
        clientId: event.clientId,
        pages: [event.page],
        startedAt: event.now,
        digits: "",
        dateBs: null,
        viewing: 0,
      };
    case "reset":
      return initialCapture;
    case "restore":
      return state.step === "idle" ? event.state : state;
  }

  if (state.step === "idle") return state; // nothing to act on

  switch (event.type) {
    case "view":
      if (state.step !== "preview" || event.index < 0 || event.index >= state.pages.length)
        return state;
      return { ...state, viewing: event.index };
    case "retake": {
      if (state.step !== "preview") return state;
      const pages = state.pages.map((p, i) => (i === state.viewing ? event.page : p));
      return { ...state, pages };
    }
    case "addPage":
      if (state.step !== "preview" || !canAddPage(state)) return state;
      return { ...state, pages: [...state.pages, event.page], viewing: state.pages.length };
    case "usePhotos": {
      if (state.step !== "preview") return state;
      const { viewing, ...draft } = state;
      return { ...draft, step: "party" };
    }
    case "pickParty":
      if (state.step !== "party") return state;
      return { ...state, step: "amount", party: event.party };
    case "amountKey":
      return state.step === "amount"
        ? { ...state, digits: pressKey(state.digits, event.key) }
        : state;
    case "amountBackspace":
      return state.step === "amount" ? { ...state, digits: backspace(state.digits) } : state;
    case "amountClear":
      return state.step === "amount" ? { ...state, digits: "" } : state;
    case "setDate":
      return state.step === "amount" ? { ...state, dateBs: event.dateBs } : state;
    case "saveStart":
      return state.step === "amount" ? { ...state, step: "saving" } : state;
    case "saveFailed":
      // Nothing is lost: back to the amount step with everything still filled in.
      return state.step === "saving" ? { ...state, step: "amount" } : state;
    case "saved":
      return state.step === "saving" ? { ...state, step: "saved" } : state;
    case "back":
      if (state.step === "amount") return { ...state, step: "party" };
      if (state.step === "party") {
        const { party, ...draft } = state;
        return { ...draft, step: "preview", viewing: draft.pages.length - 1 };
      }
      // Leaving from preview is the page's decision (leave sheet); saving/saved can't go back.
      return state;
  }
}
