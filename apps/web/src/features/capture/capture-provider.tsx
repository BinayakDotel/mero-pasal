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
import {
  type CaptureEvent,
  type CaptureState,
  captureReducer,
  droppedPages,
  initialCapture,
  type Page,
} from "./capture-machine";
import type { ProcessedPhoto } from "./image/process-image";
import { processPhoto } from "./image/process-photo";

export type PageStatus = "processing" | "ready" | "unreadable";

type CaptureValue = {
  state: CaptureState;
  dispatch: (event: CaptureEvent) => void;
  /** F-03: begin a bill from the first photo (makes the bill's clientId). */
  start: (kind: BillKind, file: Blob) => void;
  /** Wrap a new photo as a page and start shrinking it (object URL freed when the page leaves). */
  toPage: (file: Blob) => Page;
  /** F-03 / ADR-010: where each page's upload-ready version is. */
  pageStatus: (pageId: string) => PageStatus;
  /** The upload-ready version of a page (≤ 1600 px + thumbnail, no EXIF); waits if still working. */
  processed: (pageId: string) => Promise<ProcessedPhoto>;
  /** F-02: the clientId of the bill just saved, so Today can highlight it. */
  lastSaved: string | null;
};

const CaptureContext = createContext<CaptureValue | null>(null);

/**
 * Holds the bill being captured across Today and /capture, so tapping "बेचेको बिल" can open the
 * camera straight away (one tap, F-03). In memory only for now; draft restore is M2.
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
    }
    stateRef.current = after;
    setState(after);
  }, []);

  const toPage = useCallback((file: Blob): Page => {
    const id = crypto.randomUUID();
    // Start shrinking straight away, in the background: usually done before the name is picked.
    const job = processPhoto(file);
    jobs.current.set(id, job);
    setStatuses((all) => ({ ...all, [id]: "processing" }));
    job.then(
      () => setStatuses((all) => (id in all ? { ...all, [id]: "ready" } : all)),
      () => setStatuses((all) => (id in all ? { ...all, [id]: "unreadable" } : all)),
    );
    return { id, file, url: URL.createObjectURL(file) };
  }, []);

  const pageStatus = useCallback(
    (pageId: string): PageStatus => statuses[pageId] ?? "processing",
    [statuses],
  );
  const processed = useCallback((pageId: string) => {
    const job = jobs.current.get(pageId);
    return job ?? Promise.reject(new Error(`No photo job for page ${pageId}`));
  }, []);

  const start = useCallback(
    (kind: BillKind, file: Blob) =>
      dispatch({
        type: "start",
        kind,
        clientId: crypto.randomUUID(),
        page: toPage(file),
        now: Date.now(),
      }),
    [dispatch, toPage],
  );

  // Free any photos still held when the member leaves the app shell.
  useEffect(() => () => dispatch({ type: "reset" }), [dispatch]);

  const value = useMemo(
    () => ({ state, dispatch, start, toPage, pageStatus, processed, lastSaved }),
    [state, dispatch, start, toPage, pageStatus, processed, lastSaved],
  );
  return <CaptureContext.Provider value={value}>{children}</CaptureContext.Provider>;
}

export function useCapture(): CaptureValue {
  const value = useContext(CaptureContext);
  if (!value) throw new Error("useCapture must be used inside <CaptureProvider>");
  return value;
}
