"use client";

import { STEP_NUMBER } from "./capture-machine";
import { useCapture } from "./capture-provider";
import { PartyPicker } from "./party-picker";

/** F-04 capture step 2: the name picker for the bill being made. */
export function PartyStep({ onBack }: { onBack: () => void }) {
  const { state, dispatch } = useCapture();
  if (state.step !== "party") return null;
  return (
    <PartyPicker
      kind={state.kind}
      thumb={state.pages[0]?.url}
      step={STEP_NUMBER.party}
      onBack={onBack}
      onPick={(party) => dispatch({ type: "pickParty", party })}
    />
  );
}
