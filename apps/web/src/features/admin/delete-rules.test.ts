import { describe, expect, it } from "vitest";
import { confirmsName, deleteLabel, needsTypedName } from "./delete-rules";

describe("delete account confirmation (F-12, ADR-037)", () => {
  it("asks for the name from 10 bills on", () => {
    expect(needsTypedName(9)).toBe(false);
    expect(needsTypedName(10)).toBe(true);
  });

  it("accepts the name as written or its Latin form, ignoring case and spaces", () => {
    const ram = { displayName: "राम थापा", nameLatin: "Ram Thapa" };
    expect(confirmsName("राम थापा", ram)).toBe(true);
    expect(confirmsName("  ram   thapa ", ram)).toBe(true);
    expect(confirmsName("Ram", ram)).toBe(false);
    expect(confirmsName("", { displayName: "", nameLatin: "" })).toBe(false);
  });

  it("the button says how many bills go with it", () => {
    expect(deleteLabel(0)).toBe("Delete account");
    expect(deleteLabel(1)).toBe("Delete account and 1 bill");
    expect(deleteLabel(17)).toBe("Delete account and 17 bills");
  });
});
