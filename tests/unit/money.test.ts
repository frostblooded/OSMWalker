import { describe, expect, it } from "vitest";
import { euro, signed, toCents } from "../../src/core/money";

describe("money", () => {
  it("turns euros from the data into whole cents", () => {
    expect(toCents(3)).toBe(300);
    expect(toCents(5.5)).toBe(550);
    expect(toCents(0.07)).toBe(7);
    expect(toCents(1.005)).toBe(101);
  });
  it("shows euros, with cents when there are any", () => {
    expect(euro(20000)).toBe("€200");
    expect(euro(120)).toBe("€1.20");
    expect(euro(7)).toBe("€0.07");
    expect(euro(0)).toBe("€0");
    expect(euro(1234567)).toBe("€12,345.67");
  });
  it("shows a change with its sign", () => {
    expect(signed(550)).toBe("+€5.50");
    expect(signed(-300)).toBe("-€3");
  });
});
