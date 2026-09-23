"use client";

import type { BillKind } from "@mero-pasal/shared/domain";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type DraftRow, getDb } from "@/features/sync/db";
import {
  discardDraft,
  readDraft,
  removeDraftPages,
  writeDraft,
  writeDraftPage,
} from "@/features/sync/draft-store";
import {
  type CaptureEvent,
  type CaptureState,
  captureReducer,
  droppedPages,
  initialCapture,
  type Page,
  type PartyChoice,
} from "./capture-machine";
import type { ProcessedPhoto } from "./image/process-image";
import { processPhoto } from "./image/process-photo";

export type PageStatus = "processing" | "ready" | "unreadable";

/** What Today's "unfinished bill" card shows (F-03). */
export type DraftSummary = { kind: BillKind; pages: number; thumb: Blob };

type CaptureValue = {
  state: CaptureState;
  dispatch: (event: CaptureEvent) => void;
  /** F-03: begin a bill from the first photo. Resolves once the photo is safe on the phone. */
  start: (kind: BillKind, file: Blob) => Promise<void>;
  /** Wrap a new photo as a page, store it on the phone, and start shrinking it. */
  toPage: (file: Blob) => Page;
  /** F-03 / ADR-010: where each page's upload-ready version is. */
  pageStatus: (pageId: string) => PageStatus;
  /** The upload-ready version of a page (≤ 1600 px + thumbnail, no EXIF); waits if still working. */
  processed: (pageId: string) => Promise<ProcessedPhoto>;
  /** F-02: the clientId of the bill just saved, so Today can highlight it. */
  lastSaved: string | null;
  /** F-03: the unfinished bill on the phone, if any (for Today's card). */
  draftSummary: () => Promise<DraftSummary | null>;
  /** Continue the unfinished bill; false if there is none. */
  restore: () => Promise<boolean>;
  /** Throw the bill away, here and on the phone ("बिल नराखी फर्कने?" → yes, or the card's discard). */
  discard: () => Promise<void>;
};

const CaptureContext = createContext<CaptureValue | null>(null);
const DRAFT_WRITE_MS = 300;

/**
 * Holds the bill being captured across Today and /capture, so tapping "बेचेको बिल" can open the
 * camera straight away (one tap, F-03). M2: the draft is also kept on the phone, so a killed
 * Chrome tab loses nothing; Today offers to continue it.
 */
export function CaptureProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CaptureState>(initialCapture);
  const stateRef = useRef(state);
  const jobs = useRef(new Map<string, Promise<ProcessedPhoto>>());
  const [statuses, setStatuses] = useState<Record<string, PageStatus>>({});
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const dispatch = useCallback((event: CaptureEvent) => {
    const before = stateRef.current;
    const after = captureReducer(before, event);
    if (event.type === "saved" && after.step === "saved") setLastSaved(after.clientId);
    const dropped = droppedPages(before, after);
    for (const page of dropped) {
      URL.revokeObjectURL(page.url);
      jobs.current.delete(page.id);
    }
    if (dropped.length) {
      setStatuses((all) => {
        const next = { ...all };
        for (const page of dropped) delete next[page.id];
        return next;
      });
      // A retaken page leaves the draft; a finished or discarded bill clears it elsewhere.
      if (after.step === "preview")
        void removeDraftPages(
          getDb(),
          dropped.map((p) => p.id),
        );
    }
    stateRef.current = after;
    setState(after);
  }, []);

  /** Track a page's processing, storing the upload-ready version on the phone when done. */
  const track = useCallback((id: string, job: Promise<ProcessedPhoto>) => {
    jobs.current.set(id, job);
    setStatuses((all) => ({ ...all, [id]: "processing" }));
    job.then(
      (photo) => {
        setStatuses((all) => (id in all ? { ...all, [id]: "ready" } : all));
        if (jobs.current.has(id)) {
          void writeDraftPage(getDb(), {
            id,
            full: photo.full,
            thumb: photo.thumb,
            width: photo.width,
            height: photo.height,
            bytes: photo.bytes,
          });
        }
      },
      () => setStatuses((all) => (id in all ? { ...all, [id]: "unreadable" } : all)),
    );
  }, []);

  const pageWrites = useRef(new Map<string, Promise<void>>());
  const toPage = useCallback(
    (file: Blob): Page => {
      const id = crypto.randomUUID();
      pageWrites.current.set(
        id,
        writeDraftPage(getDb(), { id, raw: file }).catch(() => undefined),
      );
      track(id, processPhoto(file));
      return { id, file, url: URL.createObjectURL(file) };
    },
    [track],
  );

  const pageStatus = useCallback(
    (pageId: string): PageStatus => statuses[pageId] ?? "processing",
    [statuses],
  );
  const processed = useCallback((pageId: string) => {
    const job = jobs.current.get(pageId);
    return job ?? Promise.reject(new Error(`No photo job for page ${pageId}`));
  }, []);

  const start = useCallback(
    async (kind: BillKind, file: Blob) => {
      // One draft slot: a new bill replaces an unfinished one (Today shows the card first).
      await discardDraft(getDb()).catch(() => undefined);
      const page = toPage(file);
      const now = Date.now();
      dispatch({ type: "start", kind, clientId: crypto.randomUUID(), page, now });
      // Before leaving Today, the photo and the draft must be on the phone (a full reload of
      // /capture offline would otherwise lose them).
      await pageWrites.current.get(page.id);
      await persist(stateRef.current);
    },
    [dispatch, toPage],
  );

  // Keep the draft's small fields on the phone while a bill is being made.
  useEffect(() => {
    if (state.step !== "preview" && state.step !== "party" && state.step !== "amount") return;
    const timer = setTimeout(() => void persist(stateRef.current), DRAFT_WRITE_MS);
    return () => clearTimeout(timer);
  }, [state]);

  const draftSummary = useCallback(async (): Promise<DraftSummary | null> => {
    const found = await readDraft(getDb()).catch(() => null);
    const first = found?.pages[0];
    const thumb = first?.thumb ?? first?.raw;
    if (!found || !thumb) return null;
    return { kind: found.draft.kind, pages: found.pages.length, thumb };
  }, []);

  const restore = useCallback(async (): Promise<boolean> => {
    if (stateRef.current.step !== "idle") return true;
    const found = await readDraft(getDb()).catch(() => null);
    if (!found) return false;
    const { draft, pages: rows } = found;
    const pages: Page[] = rows.map((row) => {
      const blob = (row.full ?? row.raw) as Blob;
      if (row.full && row.thumb) {
        track(
          row.id,
          Promise.resolve({
            full: row.full,
            thumb: row.thumb,
            width: row.width ?? 0,
            height: row.height ?? 0,
            bytes: row.bytes ?? row.full.size,
          }),
        );
      } else {
        track(row.id, processPhoto(blob));
      }
      return { id: row.id, file: blob, url: URL.createObjectURL(blob) };
    });
    dispatch({ type: "restore", state: fromDraft(draft, pages) });
    return true;
  }, [dispatch, track]);

  const discard = useCallback(async () => {
    dispatch({ type: "reset" });
    await discardDraft(getDb()).catch(() => undefined);
  }, [dispatch]);

  // Free the photos held in memory when the member leaves the app shell (the draft stays).
  useEffect(() => () => dispatch({ type: "reset" }), [dispatch]);

  const value = useMemo(
    () => ({
      state,
      dispatch,
      start,
      toPage,
      pageStatus,
      processed,
      lastSaved,
      draftSummary,
      restore,
      discard,
    }),
    [
      state,
      dispatch,
      start,
      toPage,
      pageStatus,
      processed,
      lastSaved,
      draftSummary,
      restore,
      discard,
    ],
  );
  return <CaptureContext.Provider value={value}>{children}</CaptureContext.Provider>;
}

/** Store the in-progress bill's small fields (a no-op outside the editing steps). */
async function persist(state: CaptureState): Promise<void> {
  if (state.step !== "preview" && state.step !== "party" && state.step !== "amount") return;
  await writeDraft(
    getDb(),
    {
      kind: state.kind,
      clientId: state.clientId,
      step: state.step,
      pageIds: state.pages.map((p) => p.id),
      ...(state.step === "preview" ? {} : state.party ? { party: state.party } : {}),
      digits: state.digits,
      dateBs: state.dateBs,
      startedAt: state.startedAt,
    },
    Date.now(),
  ).catch(() => undefined); // best effort: the in-memory bill is still there
}

/** Rebuild the capture state from a stored draft (a bill caught mid-save resumes at the amount). */
function fromDraft(
  draft: DraftRow,
  pages: Page[],
): Exclude<CaptureState, { step: "idle" | "saving" | "saved" }> {
  const base = {
    kind: draft.kind,
    clientId: draft.clientId,
    pages,
    startedAt: draft.startedAt,
    digits: draft.digits,
    dateBs: draft.dateBs,
  };
  const party = draft.party as PartyChoice | undefined;
  if (draft.step === "amount" && party) return { ...base, step: "amount", party };
  if (draft.step === "party" || (draft.step === "amount" && !party))
    return { ...base, step: "party" };
  return { ...base, step: "preview", viewing: Math.max(0, pages.length - 1) };
}

export function useCapture(): CaptureValue {
  const value = useContext(CaptureContext);
  if (!value) throw new Error("useCapture must be used inside <CaptureProvider>");
  return value;
}
