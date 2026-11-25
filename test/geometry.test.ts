import { describe, expect, it } from "vitest";
import { BOARD_PX, IMAGE_HEIGHT, SQUARE_PX, parseIsmapQuery, pointToSquare, squareOrigin } from "../src/geometry";

describe("parseIsmapQuery", () => {
  it("reads the raw x,y query a browser appends", () => {
    expect(parseIsmapQuery("?10,20")).toEqual({ x: 10, y: 20 });
    expect(parseIsmapQuery("287,0")).toEqual({ x: 287, y: 0 });
  });

  it.each(["", "?", "?10", "?10,", "?,20", "?x=1&y=2", "?-1,5", "?1.5,2", "?1,2,3", "?10,20&a=b", "?999999,1"])(
    "rejects %j",
    (q) => expect(parseIsmapQuery(q)).toBeNull(),
  );
});

describe("board width", () => {
  it("fits unscaled in GitHub's mobile README column on a 360px phone", () => {
    // Measured: the profile README column is the viewport width minus 82px.
    expect(BOARD_PX).toBeLessThanOrEqual(360 - 82);
  });
});

describe("pointToSquare", () => {
  it("puts white at the bottom", () => {
    expect(pointToSquare({ x: 0, y: 0 })).toBe("a8");
    expect(pointToSquare({ x: BOARD_PX - 1, y: 0 })).toBe("h8");
    expect(pointToSquare({ x: 0, y: BOARD_PX - 1 })).toBe("a1");
    expect(pointToSquare({ x: BOARD_PX - 1, y: BOARD_PX - 1 })).toBe("h1");
  });

  it("maps square edges", () => {
    // e2: file index 4, row from top 6
    expect(pointToSquare({ x: 4 * SQUARE_PX, y: 6 * SQUARE_PX })).toBe("e2");
    expect(pointToSquare({ x: 5 * SQUARE_PX - 1, y: 7 * SQUARE_PX - 1 })).toBe("e2");
    expect(pointToSquare({ x: 5 * SQUARE_PX, y: 6 * SQUARE_PX })).toBe("f2");
  });

  it("ignores clicks off the board, including the status strip", () => {
    expect(pointToSquare({ x: BOARD_PX, y: 10 })).toBeNull();
    expect(pointToSquare({ x: 10, y: BOARD_PX })).toBeNull();
    expect(pointToSquare({ x: 10, y: IMAGE_HEIGHT - 1 })).toBeNull();
  });

  it("round-trips with squareOrigin", () => {
    for (const f of "abcdefgh")
      for (let r = 1; r <= 8; r++) {
        const o = squareOrigin(f + r);
        expect(pointToSquare({ x: o.x + 5, y: o.y + 5 })).toBe(f + r);
      }
  });
});
