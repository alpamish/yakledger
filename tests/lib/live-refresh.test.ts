import { emitRefresh, subscribeRefresh, isTabActive } from "@/lib/live-refresh";

describe("live-refresh (server-safe no-ops)", () => {
  it("isTabActive returns true outside a browser", () => {
    expect(isTabActive()).toBe(true);
  });

  it("emitRefresh is a no-op outside a browser", () => {
    expect(() => emitRefresh()).not.toThrow();
  });

  it("subscribeRefresh returns a callable unsubscribe outside a browser", () => {
    const unsubscribe = subscribeRefresh(() => {});
    expect(typeof unsubscribe).toBe("function");
    expect(() => unsubscribe()).not.toThrow();
  });
});