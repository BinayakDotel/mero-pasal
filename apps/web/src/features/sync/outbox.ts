// Buwa's writes go through the outbox (code-standard §5, architecture §8). An item is one write the
// server must receive exactly once, identified by its clientId (idempotent on the server).
// `enqueueDurable` (outbox-store.ts) stores items on the phone; the sync engine sends them with
// `processItem`.

export type OutboxPage = {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
  bytes: number;
  /** Set after upload, so a retry never uploads the same page twice (architecture §8.2). */
  storageId?: string;
  thumbId?: string;
};

export type PartyCreateItem = {
  type: "party.create";
  clientId: string;
  createdAt: number;
  attempts: number;
  payload: { name: string; kind: "customer" | "supplier"; phone?: string; tag?: string };
};

export type TxCreateItem = {
  type: "tx.create";
  clientId: string;
  createdAt: number;
  attempts: number;
  payload: {
    kind: "sale" | "purchase";
    partyRef?: { id: string } | { clientId: string };
    dateBs: string;
    amountPaisa?: number;
    /** M2: phone time the photo was taken (ordering only). */
    clientCapturedAt?: number;
  };
  pages: OutboxPage[];
};

export type OutboxItem = PartyCreateItem | TxCreateItem;

/** The network side of sending, injected so it can be faked in tests (and reused by M2). */
export type OutboxDeps = {
  createParty: (args: { clientId: string } & PartyCreateItem["payload"]) => Promise<unknown>;
  generateUploadUrl: () => Promise<string>;
  upload: (url: string, blob: Blob) => Promise<string>;
  createTx: (
    args: { clientId: string } & TxCreateItem["payload"] & {
        photos: {
          storageId: string;
          thumbId: string;
          width: number;
          height: number;
          bytes: number;
        }[];
      },
  ) => Promise<unknown>;
};

async function uploadOnce(deps: OutboxDeps, blob: Blob): Promise<string> {
  return deps.upload(await deps.generateUploadUrl(), blob);
}

/**
 * Sends one item. Safe to call again after any failure: uploaded pages are skipped and the server
 * de-duplicates by clientId. Mutates `item` to record progress (storageIds, attempts).
 */
export async function processItem(
  item: OutboxItem,
  deps: OutboxDeps,
  /** M2: persist upload progress after each upload, so a restart never uploads twice. */
  onProgress?: (item: OutboxItem) => Promise<void>,
): Promise<void> {
  item.attempts += 1;
  if (item.type === "party.create") {
    await deps.createParty({ clientId: item.clientId, ...item.payload });
    return;
  }
  for (const page of item.pages) {
    if (page.storageId === undefined) {
      page.storageId = await uploadOnce(deps, page.full);
      await onProgress?.(item);
    }
    if (page.thumbId === undefined) {
      page.thumbId = await uploadOnce(deps, page.thumb);
      await onProgress?.(item);
    }
  }
  await deps.createTx({
    clientId: item.clientId,
    ...item.payload,
    photos: item.pages.map((p) => ({
      storageId: p.storageId as string,
      thumbId: p.thumbId as string,
      width: p.width,
      height: p.height,
      bytes: p.bytes,
    })),
  });
}

/** Parties first, so a bill never reaches the server before the new name it refers to (§8.2). */
export function orderForSending(items: readonly OutboxItem[]): OutboxItem[] {
  return [...items].sort((a, b) => Number(a.type === "tx.create") - Number(b.type === "tx.create"));
}
