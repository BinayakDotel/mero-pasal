"use client";

import { api } from "@mero-pasal/backend/convex/_generated/api";
import type { Id } from "@mero-pasal/backend/convex/_generated/dataModel";
import { todayBs } from "@mero-pasal/shared/dates";
import { useMutation } from "convex/react";
import { useCallback, useMemo, useRef } from "react";
import {
  enqueue,
  OfflineError,
  type OutboxDeps,
  type OutboxItem,
  type OutboxPage,
} from "@/features/sync/outbox";
import { digitsToPaisa } from "./amount-entry";
import { useCapture } from "./capture-provider";
import { UnreadablePhotoError } from "./image/process-image";

export type SaveResult = "saved" | "offline" | "unreadable" | "failed";

async function uploadBlob(url: string, blob: Blob): Promise<string> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": blob.type || "image/jpeg" },
    body: blob,
  });
  if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
  const { storageId } = (await response.json()) as { storageId: string };
  return storageId;
}

/**
 * F-03 Save: turn the draft into outbox items (a new name first, then the bill) and send them.
 * `withAmount = false` is "रकम पछि हाल्छु". Retrying after a failure reuses uploaded photos and
 * skips items the server already has. The date defaults to today in NPT at the moment of saving.
 */
export function useSaveBill() {
  const { state, dispatch, processed } = useCapture();
  const createParty = useMutation(api.parties.create);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const createTx = useMutation(api.transactions.createFromClient);
  const pages = useRef(new Map<string, OutboxPage>());
  const done = useRef(new Set<string>());

  const deps = useMemo<OutboxDeps>(
    () => ({
      createParty: (args) => createParty(args),
      generateUploadUrl: () => generateUploadUrl({}),
      upload: uploadBlob,
      createTx: ({ partyRef, photos, ...rest }) =>
        createTx({
          ...rest,
          ...(partyRef === undefined
            ? {}
            : { partyRef: "id" in partyRef ? { id: partyRef.id as Id<"parties"> } : partyRef }),
          photos: photos.map((p) => ({
            ...p,
            storageId: p.storageId as Id<"_storage">,
            thumbId: p.thumbId as Id<"_storage">,
          })),
        }),
    }),
    [createParty, generateUploadUrl, createTx],
  );

  return useCallback(
    async (withAmount: boolean): Promise<SaveResult> => {
      if (state.step !== "amount") return "failed";
      dispatch({ type: "saveStart" });
      try {
        const outboxPages: OutboxPage[] = [];
        for (const page of state.pages) {
          let entry = pages.current.get(page.id);
          if (!entry) {
            const photo = await processed(page.id);
            entry = {
              full: photo.full,
              thumb: photo.thumb,
              width: photo.width,
              height: photo.height,
              bytes: photo.bytes,
            };
            pages.current.set(page.id, entry);
          }
          outboxPages.push(entry);
        }

        const now = Date.now();
        const items: OutboxItem[] = [];
        const { party } = state;
        if (party.type === "new") {
          items.push({
            type: "party.create",
            clientId: party.clientId,
            createdAt: now,
            attempts: 0,
            payload: {
              name: party.displayName,
              kind: state.kind === "sale" ? "customer" : "supplier",
              ...(party.phone ? { phone: party.phone } : {}),
              ...(party.tag ? { tag: party.tag } : {}),
            },
          });
        }
        const amountPaisa = withAmount ? digitsToPaisa(state.digits) : undefined;
        items.push({
          type: "tx.create",
          clientId: state.clientId,
          createdAt: now,
          attempts: 0,
          payload: {
            kind: state.kind,
            ...(party.type === "existing" ? { partyRef: { id: party.id } } : {}),
            ...(party.type === "new" ? { partyRef: { clientId: party.clientId } } : {}),
            dateBs: state.dateBs ?? todayBs(now),
            ...(amountPaisa === undefined ? {} : { amountPaisa }),
          },
          pages: outboxPages,
        });

        await enqueue(items, deps, () => navigator.onLine, done.current);
        dispatch({ type: "saved" });
        return "saved";
      } catch (error) {
        dispatch({ type: "saveFailed" });
        if (error instanceof OfflineError) return "offline";
        if (error instanceof UnreadablePhotoError) return "unreadable";
        return "failed";
      }
    },
    [state, dispatch, processed, deps],
  );
}
