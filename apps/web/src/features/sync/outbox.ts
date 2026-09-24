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
  /**
   * Set (and saved) just before the server call: the server may now have this bill even if the
   * phone never hears back, so it must not be dropped or edited in place (F-08). Cleared when the
   * server clearly refused it.
   */
  submitted?: boolean;
};

/** What the phone showed for a bill before a correction or removal (display and totals, M3). */
export type BillBefore = {
  kind: "sale" | "purchase";
  dateBs: string;
  partyId?: string;
  partyName?: string;
  amountPaisa?: number;
};

/**
 * F-08 correct: the bill's full new values (not a diff), so the server can apply it any number of
 * times with the same result. `clientId` is this operation's own id; the bill is `billClientId`.
 */
export type TxCorrectItem = {
  type: "tx.correct";
  clientId: string;
  createdAt: number;
  attempts: number;
  payload: {
    billClientId: string;
    kind: "sale" | "purchase";
    partyRef?: { id: string } | { clientId: string };
    dateBs: string;
    amountPaisa?: number;
  };
  before: BillBefore;
};

/** F-08 remove: sent only after the 6 s undo window (`nextAttemptAt`). */
export type TxRemoveItem = {
  type: "tx.remove";
  clientId: string;
  createdAt: number;
  attempts: number;
  payload: { billClientId: string };
  before: BillBefore;
};

export type OutboxItem = PartyCreateItem | TxCreateItem | TxCorrectItem | TxRemoveItem;

/** The bill an item is about (its own clientId for a create; none for a name). */
export function billOf(item: OutboxItem): string | undefined {
  if (item.type === "tx.create") return item.clientId;
  if (item.type === "tx.correct" || item.type === "tx.remove") return item.payload.billClientId;
  return undefined;
}

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
  correctTx: (
    args: { clientId: string } & Omit<TxCorrectItem["payload"], "billClientId">,
  ) => Promise<unknown>;
  removeTx: (args: { clientId: string }) => Promise<unknown>;
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
  if (item.type === "tx.correct") {
    const { billClientId, ...values } = item.payload;
    await deps.correctTx({ clientId: billClientId, ...values });
    return;
  }
  if (item.type === "tx.remove") {
    await deps.removeTx({ clientId: item.payload.billClientId });
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
  item.submitted = true;
  await onProgress?.(item);
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
