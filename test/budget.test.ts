import { describe, expect, it } from "vitest";
import { Budget } from "../src/budget";

const T = 1_000_000;

describe("Budget", () => {
  it("starts full and allows a burst", () => {
    const b = new Budget(3, 1_000, T);
    expect([b.take(T), b.take(T), b.take(T)]).toEqual([true, true, true]);
    expect(b.take(T)).toBe(false);
  });

  it("refills one token per period", () => {
    const b = new Budget(2, 1_000, T);
    b.take(T);
    b.take(T);
    expect(b.take(T + 999)).toBe(false);
    expect(b.take(T + 1_000)).toBe(true);
    expect(b.take(T + 1_000)).toBe(false);
  });

  it("keeps partial refill across refused takes", () => {
    const b = new Budget(1, 1_000, T);
    b.take(T);
    expect(b.take(T + 500)).toBe(false);
    expect(b.take(T + 1_000)).toBe(true);
  });

  it("never holds more than the burst", () => {
    const b = new Budget(2, 1_000, T);
    const later = T + 60_000;
    expect([b.take(later), b.take(later), b.take(later)]).toEqual([true, true, false]);
  });

  it("adds nothing when the clock runs backwards", () => {
    const b = new Budget(1, 1_000, T);
    b.take(T);
    expect(b.take(T - 5_000)).toBe(false);
    expect(b.take(T + 1_000)).toBe(true);
  });
});
