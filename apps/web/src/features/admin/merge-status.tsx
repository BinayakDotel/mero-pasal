"use client";

import { api } from "@mero-pasal/backend/convex/_generated/api";
import type { Id } from "@mero-pasal/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useConnection } from "@/features/sync/use-connection";
import { Button, useShowError } from "./ui";

/** A merge still moving bills: running, or stuck after a failed batch. Both actions are safe. */
export function MergingCell({ mergeId, into }: { mergeId: string; into: string }) {
  const resume = useMutation(api.partyAdmin.resumeMerge);
  const stop = useMutation(api.partyAdmin.stopMerge);
  const showError = useShowError();
  const online = useConnection();
  return (
    <span className="flex items-center gap-2">
      <span className="font-semibold text-bahi">Merging into {into}…</span>
      <Button
        tone="ghost"
        className="h-8"
        disabled={!online}
        onClick={(e) => {
          e.stopPropagation();
          resume({ mergeId: mergeId as Id<"parties"> }).catch(showError);
        }}
      >
        Resume
      </Button>
      <Button
        tone="ghost"
        className="h-8"
        disabled={!online}
        onClick={(e) => {
          e.stopPropagation();
          if (window.confirm("Stop this merge? Bills already moved stay moved.")) {
            stop({ mergeId: mergeId as Id<"parties"> }).catch(showError);
          }
        }}
      >
        Stop
      </Button>
    </span>
  );
}
