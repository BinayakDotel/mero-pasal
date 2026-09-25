import { describe, expect, it } from "vitest";
import { adoptsNewVersion, type DrawerBill, formFromBill, isDirty, saveArgs } from "./bill-form";

const bill: DrawerBill = {
  clientId: "c1",
  kind: "sale",
  partyId: "p1",
  amountPaisa: 45_000,
  dateBs: "2083-06-01",
  billNumber: "12",
  updatedAt: 7,
};

describe("admin bill drawer form (F-11)", () => {
  it("starts from the bill and is clean until something changes", () => {
    const form = formFromBill(bill);
    expect(form).toEqual({
      kind: "sale",
      partyId: "p1",
      rupees: "450",
      dateBs: "2083-06-01",
      billNumber: "12",
      note: "",
    });
    expect(isDirty(form, bill)).toBe(false);
    expect(isDirty({ ...form, note: "  " }, bill)).toBe(false);
    expect(isDirty({ ...form, rupees: "451" }, bill)).toBe(true);
  });

  it("sends the full values against the version shown", () => {
    const got = saveArgs(
      { ...formFromBill(bill), rupees: "500", note: "read off the photo" },
      bill,
    );
    expect(got).toEqual({
      ok: true,
      args: {
        clientId: "c1",
        kind: "sale",
        partyId: "p1",
        amountPaisa: 50_000,
        dateBs: "2083-06-01",
        billNumber: "12",
        note: "read off the photo",
        expectedUpdatedAt: 7,
      },
    });
  });

  it("empty amount and no account clear them; bill number '' clears", () => {
    const got = saveArgs({ ...formFromBill(bill), rupees: "", partyId: "", billNumber: "" }, bill);
    if (!got.ok) throw new Error(got.error);
    expect(got.args.amountPaisa).toBeUndefined();
    expect(got.args.partyId).toBeUndefined();
    expect(got.args.billNumber).toBe("");
  });

  it("an old amount with paisa is kept unless edited", () => {
    const odd = { ...bill, amountPaisa: 45_050 };
    expect(formFromBill(odd).rupees).toBe("450.50");
    const got = saveArgs({ ...formFromBill(odd), note: "x" }, odd);
    expect(got.ok && got.args.amountPaisa).toBe(45_050);
  });

  it("refuses rupees with paisa, words, and unreal dates", () => {
    expect(saveArgs({ ...formFromBill(bill), rupees: "12.5" }, bill).ok).toBe(false);
    expect(saveArgs({ ...formFromBill(bill), rupees: "abc" }, bill).ok).toBe(false);
    expect(saveArgs({ ...formFromBill(bill), dateBs: "2083-13-01" }, bill).ok).toBe(false);
  });

  it("moves to a newer version only when that loses no edits", () => {
    const newer = { ...bill, amountPaisa: 90_000, updatedAt: 8 }; // Buwa corrected it
    const untouched = formFromBill(bill);
    expect(adoptsNewVersion(untouched, bill, bill)).toBe(false); // same version
    expect(adoptsNewVersion(untouched, bill, newer)).toBe(true);
    const edited = { ...untouched, note: "mine" };
    expect(adoptsNewVersion(edited, bill, newer)).toBe(false); // keep the edits, warn
    const saved = { ...bill, note: "mine", updatedAt: 9 }; // this admin's own save came back
    expect(adoptsNewVersion(edited, bill, saved)).toBe(true);
  });
});
