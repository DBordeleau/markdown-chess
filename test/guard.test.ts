import { describe, expect, it } from "vitest";
import { clientId, isNavigation } from "../src/guard";

const URL_ = "https://chess.example/click?10,10";

function req(headers: Record<string, string> = {}, method = "GET"): Request {
  return new Request(URL_, { method, headers });
}

describe("isNavigation", () => {
  it("accepts a browser navigation", () => {
    expect(
      isNavigation(req({ "User-Agent": "Mozilla/5.0", "Sec-Fetch-Dest": "document", "Sec-Fetch-Mode": "navigate" })),
    ).toBe(true);
  });

  it("accepts a request without Sec-Fetch headers", () => {
    expect(isNavigation(req({ "User-Agent": "Mozilla/5.0" }))).toBe(true);
    expect(isNavigation(req())).toBe(true);
  });

  it.each(["HEAD", "POST", "PUT"])("rejects method %s", (method) => {
    expect(isNavigation(req({}, method))).toBe(false);
  });

  it("rejects GitHub's image proxy in any case", () => {
    expect(isNavigation(req({ "User-Agent": "github-camo (876543)" }))).toBe(false);
    expect(isNavigation(req({ "User-Agent": "GitHub-Camo/1.0" }))).toBe(false);
  });

  it.each(["image", "empty", "iframe"])("rejects Sec-Fetch-Dest %s", (dest) => {
    expect(isNavigation(req({ "Sec-Fetch-Dest": dest }))).toBe(false);
  });

  it.each(["no-cors", "cors", "same-origin"])("rejects Sec-Fetch-Mode %s", (mode) => {
    expect(isNavigation(req({ "Sec-Fetch-Mode": mode }))).toBe(false);
  });
});

describe("clientId", () => {
  it("is null without CF-Connecting-IP", () => {
    expect(clientId(req())).toBeNull();
  });

  it("is a short stable hash that hides the address", () => {
    const a = clientId(req({ "CF-Connecting-IP": "203.0.113.7" }));
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(a).not.toContain("203");
    expect(clientId(req({ "CF-Connecting-IP": "203.0.113.7" }))).toBe(a);
  });

  it("differs between addresses", () => {
    const a = clientId(req({ "CF-Connecting-IP": "203.0.113.7" }));
    const b = clientId(req({ "CF-Connecting-IP": "203.0.113.8" }));
    expect(a).not.toBe(b);
  });
});
