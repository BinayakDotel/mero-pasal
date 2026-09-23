"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AmountStep } from "./amount-step";
import { useCapture } from "./capture-provider";
import { LeaveSheet } from "./leave-sheet";
import { PartyStep } from "./party-step";
import { PreviewStep } from "./preview-step";
import { SavedStep } from "./saved-step";

/**
 * F-03 full-screen capture flow (no bottom nav, ui-ux §4). Android's back button and the on-screen
 * back arrow both step back; on the first step they ask "बिल नराखी फर्कने?" before discarding.
 */
export function CaptureScreen() {
  const { state, dispatch } = useCapture();
  const router = useRouter();
  const [leaveOpen, setLeaveOpen] = useState(false);
  const leaving = useRef(false);

  // Nothing to capture (e.g. the page was reloaded): back to Today. Draft restore is M2.
  useEffect(() => {
    if (state.step === "idle" && !leaving.current) router.replace("/");
  }, [state.step, router]);

  const back = useCallback(() => {
    if (state.step === "saving" || state.step === "saved") return; // mid-save: stay put
    if (state.step === "preview") setLeaveOpen(true);
    else dispatch({ type: "back" });
  }, [state.step, dispatch]);

  // Trap the phone's back button while a bill is in progress: each press becomes one `back`.
  const backRef = useRef(back);
  backRef.current = back;
  useEffect(() => {
    window.history.pushState({ captureGuard: true }, "");
    const onPop = () => {
      if (leaving.current) return;
      window.history.pushState({ captureGuard: true }, "");
      backRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // After the stamp: clear the draft; SavedStep navigates to Today.
  const finish = useCallback(() => {
    leaving.current = true;
    dispatch({ type: "reset" });
  }, [dispatch]);

  const leave = () => {
    leaving.current = true;
    setLeaveOpen(false);
    dispatch({ type: "reset" });
    router.replace("/");
  };

  return (
    <>
      {state.step === "preview" ? <PreviewStep onBack={back} /> : null}
      {state.step === "party" ? <PartyStep onBack={back} /> : null}
      {state.step === "amount" || state.step === "saving" ? <AmountStep onBack={back} /> : null}
      {state.step === "saved" ? <SavedStep onDone={finish} /> : null}
      <LeaveSheet open={leaveOpen} onStay={() => setLeaveOpen(false)} onLeave={leave} />
    </>
  );
}
