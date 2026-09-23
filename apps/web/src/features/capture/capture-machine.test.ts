import { describe, expect, it } from "vitest";
import {
  type CaptureState,
  canAddPage,
  captureReducer,
  droppedPages,
  initialCapture,
  type Page,
} from "./capture-machine";

const page = (id: string): Page => ({ id, file: new Blob([id]), url: `blob:${id}` });
const started = captureReducer(initialCapture, {
  type: "start",
  kind: "sale",
  clientId: "c1",
  page: page("p1"),
  now: 1,
});
const run = (state: CaptureState, ...events: Parameters<typeof captureReducer>[1][]) =>
  events.reduce(captureReducer, state);

describe("capture state machine (F-03)", () => {
  it("the first photo starts a draft with its clientId and goes to preview", () => {
    expect(started).toMatchObject({ step: "preview", kind: "sale", clientId: "c1", viewing: 0 });
    expect(started.step !== "idle" && started.pages.map((p) => p.id)).toEqual(["p1"]);
  });

  it("add page appends and shows the new page, up to 5 pages", () => {
    let s = started;
    for (const id of ["p2", "p3", "p4", "p5", "p6"])
      s = captureReducer(s, { type: "addPage", page: page(id) });
    expect(s.step !== "idle" && s.pages.map((p) => p.id)).toEqual(["p1", "p2", "p3", "p4", "p5"]);
    expect(s).toMatchObject({ viewing: 4 });
    expect(canAddPage(s)).toBe(false);
    expect(canAddPage(started)).toBe(true);
  });

  it("retake replaces the page being viewed", () => {
    const s = run(
      started,
      { type: "addPage", page: page("p2") },
      { type: "view", index: 0 },
      { type: "retake", page: page("p1b") },
    );
    expect(s.step !== "idle" && s.pages.map((p) => p.id)).toEqual(["p1b", "p2"]);
  });

  it("ignores viewing a page that doesn't exist", () => {
    expect(captureReducer(started, { type: "view", index: 3 })).toBe(started);
    expect(captureReducer(started, { type: "view", index: -1 })).toBe(started);
  });

  it("use photo → whose bill? → amount, and back again, keeping the clientId", () => {
    const party = run(started, { type: "usePhotos" });
    expect(party).toMatchObject({ step: "party", clientId: "c1" });
    expect(party).not.toHaveProperty("viewing");

    const amount = captureReducer(party, { type: "pickParty", party: { type: "later" } });
    expect(amount).toMatchObject({ step: "amount", party: { type: "later" }, clientId: "c1" });

    const backToParty = captureReducer(amount, { type: "back" });
    expect(backToParty).toMatchObject({ step: "party", clientId: "c1" });

    const backToPreview = captureReducer(backToParty, { type: "back" });
    expect(backToPreview).toMatchObject({ step: "preview", viewing: 0 });
    expect(backToPreview).not.toHaveProperty("party");
    expect(captureReducer(backToPreview, { type: "back" })).toBe(backToPreview); // page shows the leave sheet
  });

  it("events that don't fit the current step are ignored", () => {
    expect(captureReducer(initialCapture, { type: "usePhotos" })).toBe(initialCapture);
    expect(captureReducer(started, { type: "pickParty", party: { type: "later" } })).toBe(started);
    const party = run(started, { type: "usePhotos" });
    expect(captureReducer(party, { type: "retake", page: page("x") })).toBe(party);
    expect(captureReducer(party, { type: "addPage", page: page("x") })).toBe(party);
    expect(captureReducer(party, { type: "view", index: 0 })).toBe(party);
    expect(captureReducer(party, { type: "usePhotos" })).toBe(party);
  });

  it("F-03 / F-05: the amount and date are kept when stepping back and forth", () => {
    let s = run(started, { type: "usePhotos" }, { type: "pickParty", party: { type: "later" } });
    s = run(
      s,
      { type: "amountKey", key: "2" },
      { type: "amountKey", key: "00" },
      { type: "amountKey", key: "5" },
      { type: "amountBackspace" },
      { type: "setDate", dateBs: "2083-06-06" },
    );
    expect(s).toMatchObject({ digits: "200", dateBs: "2083-06-06" });
    s = run(s, { type: "back" }, { type: "pickParty", party: { type: "later" } });
    expect(s).toMatchObject({ step: "amount", digits: "200", dateBs: "2083-06-06" });
    expect(captureReducer(s, { type: "amountClear" })).toMatchObject({ digits: "" });
  });

  it("amount and date events only apply on the amount step", () => {
    for (const event of [
      { type: "amountKey", key: "5" },
      { type: "amountBackspace" },
      { type: "amountClear" },
      { type: "setDate", dateBs: "2083-06-06" },
    ] as const) {
      expect(captureReducer(started, event)).toBe(started);
    }
  });

  it("reset discards the draft", () => {
    expect(captureReducer(started, { type: "reset" })).toEqual({ step: "idle" });
  });

  it("reports which pages were dropped, so their object URLs can be freed", () => {
    const retaken = captureReducer(started, { type: "retake", page: page("p1b") });
    expect(droppedPages(started, retaken).map((p) => p.id)).toEqual(["p1"]);
    expect(droppedPages(started, initialCapture).map((p) => p.id)).toEqual(["p1"]);
    expect(droppedPages(initialCapture, started)).toEqual([]);
  });
});
