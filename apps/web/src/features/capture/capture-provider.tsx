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

type CaptureValue = {
  state: CaptureState;
  dispatch: (event: CaptureEvent) => void;
  /** F-03: begin a bill from the first photo (makes the bill's clientId). */
  start: (kind: BillKind, file: Blob) => void;
  /** Wrap a new photo as a page (the object URL is freed when the page leaves the draft). */
  toPage: (file: Blob) => Page;
};

const CaptureContext = createContext<CaptureValue | null>(null);

/**
 * Holds the bill being captured across Today and /capture, so tapping "बेचेको बिल" can open the
 * camera straight away (one tap, F-03). In memory only for now; draft restore is M2.
 */
export function CaptureProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CaptureState>(initialCapture);
  const stateRef = useRef(state);

  const dispatch = useCallback((event: CaptureEvent) => {
    const before = stateRef.current;
    const after = captureReducer(before, event);
    for (const page of droppedPages(before, after)) URL.revokeObjectURL(page.url);
    stateRef.current = after;
    setState(after);
  }, []);

  const toPage = useCallback(
    (file: Blob): Page => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }),
    [],
  );

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
    () => ({ state, dispatch, start, toPage }),
    [state, dispatch, start, toPage],
  );
  return <CaptureContext.Provider value={value}>{children}</CaptureContext.Provider>;
}

export function useCapture(): CaptureValue {
  const value = useContext(CaptureContext);
  if (!value) throw new Error("useCapture must be used inside <CaptureProvider>");
  return value;
}
