// The head's service worker registration (#15) waits for Explore's first render (#124), so the
// worker's precache doesn't compete with the program's data on a first visit.
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import config from "../observablehq.config.js";

const classicScript = [
  ...config.head.matchAll(/<script>([^]*?)<\/script>/g),
].map((m) => m[1])[0];

/** A page with the head's classic script run; `body` is the page's static HTML. */
function page(body = "") {
  const { window } = new JSDOM(
    `<!doctype html><head><meta name="viewport" content="width=device-width"></head><body>${body}</body>`,
    { url: "http://127.0.0.1:3000/", runScripts: "outside-only" },
  );
  const register = vi.fn(() => Promise.resolve());
  Object.defineProperty(window.navigator, "serviceWorker", {
    value: { register },
  });
  window.eval(classicScript);
  const load = () => window.dispatchEvent(new window.Event("load"));
  const rendered = () =>
    window.dispatchEvent(new window.Event("papersnavigator:rendered"));
  return { window, register, load, rendered };
}

describe("service worker registration", () => {
  it("registers on load on pages without a heavy first render", () => {
    const { register, load } = page("<main></main>");
    expect(register).not.toHaveBeenCalled();
    load();
    expect(register).toHaveBeenCalledWith("./sw.js");
  });

  it("waits for the page's first render where it asks to (Explore)", () => {
    const { register, load, rendered } = page(
      "<div data-sw-after-render></div>",
    );
    load();
    expect(register).not.toHaveBeenCalled();
    rendered();
    expect(register).toHaveBeenCalledTimes(1);
    rendered();
    expect(register).toHaveBeenCalledTimes(1);
  });

  it("registers after load if the render happened first", () => {
    const { register, load, rendered } = page(
      "<div data-sw-after-render></div>",
    );
    rendered();
    expect(register).not.toHaveBeenCalled();
    load();
    expect(register).toHaveBeenCalledTimes(1);
  });

  it("still registers a minute after load if the render never says so", () => {
    vi.useFakeTimers();
    try {
      const { window, register, load } = page(
        "<div data-sw-after-render></div>",
      );
      // jsdom's timers are its own: drive them through the window
      window.setTimeout = setTimeout;
      load();
      vi.advanceTimersByTime(59_000);
      expect(register).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1_000);
      expect(register).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
