import { describe, expect, it, vi } from "vitest";
import { type OutboxDeps, type OutboxItem, orderForSending, processItem } from "./outbox";

const page = () => ({
  full: new Blob(["f"]),
  thumb: new Blob(["t"]),
  width: 1200,
  height: 1600,
  bytes: 1,
});
const party = (): OutboxItem => ({
  type: "party.create",
  clientId: "p1",
  createdAt: 1,
  attempts: 0,
  payload: { name: "Ram", kind: "customer" },
});
const bill = (pages = [page()]): OutboxItem => ({
  type: "tx.create",
  clientId: "t1",
  createdAt: 2,
  attempts: 0,
  payload: {
    kind: "sale",
    partyRef: { clientId: "p1" },
    dateBs: "2083-06-07",
    amountPaisa: 234_000,
  },
  pages,
});

function fakeDeps(overrides: Partial<OutboxDeps> = {}) {
  let n = 0;
  const calls: string[] = [];
  const deps: OutboxDeps = {
    createParty: vi.fn(async (a) => calls.push(`party:${a.clientId}`)),
    generateUploadUrl: vi.fn(async () => `url${++n}`),
    upload: vi.fn(async (url) => {
      calls.push(`upload:${url}`);
      return `storage-${url}`;
    }),
    createTx: vi.fn(async (a) => calls.push(`tx:${a.clientId}`)),
    ...overrides,
  };
  return { deps, calls };
}

describe("outbox (architecture §8, F-03)", () => {
  it("§8.2: a retry never re-uploads a page that already went up", async () => {
    let fail = true;
    const { deps } = fakeDeps({
      createTx: vi.fn(async () => {
        if (fail) throw new Error("server hiccup");
      }),
    });
    const item = bill([page(), page()]);
    await expect(processItem(item, deps)).rejects.toThrow("server hiccup");
    expect(deps.upload).toHaveBeenCalledTimes(4);
    fail = false;
    await processItem(item, deps);
    expect(deps.upload).toHaveBeenCalledTimes(4); // nothing uploaded again
    expect(item.attempts).toBe(2);
  });

  it("reports progress after each upload (M2 persists it)", async () => {
    const { deps } = fakeDeps();
    const seen: (string | undefined)[][] = [];
    const item = bill([page()]);
    await processItem(item, deps, async (it) => {
      if (it.type === "tx.create") seen.push(it.pages.flatMap((p) => [p.storageId, p.thumbId]));
    });
    expect(seen).toEqual([
      ["storage-url1", undefined],
      ["storage-url1", "storage-url2"],
    ]);
  });

  it("resumes an interrupted upload at the page that failed", async () => {
    let uploads = 0;
    const { deps } = fakeDeps({
      upload: vi.fn(async (url) => {
        uploads++;
        if (uploads === 3) throw new Error("dropped");
        return `s-${url}`;
      }),
    });
    const item = bill([page(), page()]);
    await expect(processItem(item, deps)).rejects.toThrow("dropped");
    expect(item.type === "tx.create" && item.pages.map((p) => [p.storageId, p.thumbId])).toEqual([
      ["s-url1", "s-url2"],
      [undefined, undefined],
    ]);
    await processItem(item, deps);
    expect(deps.upload).toHaveBeenCalledTimes(5); // 3 before (one failed) + the 2 remaining
  });

  it("orders parties before bills without reordering within a type", () => {
    const a = party();
    const b = { ...party(), clientId: "p2" };
    expect(orderForSending([bill(), a, b]).map((i) => i.clientId)).toEqual(["p1", "p2", "t1"]);
  });
});
