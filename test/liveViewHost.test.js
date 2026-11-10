// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createViewHost } from "../src/components/liveViewHost.js";

describe("createViewHost (#203 review: focus survives the clock)", () => {
  const view = () => {
    const el = document.createElement("div");
    el.append(document.createElement("textarea"));
    el.setNow = vi.fn();
    el.dispose = vi.fn();
    return el;
  };

  it("builds once per key; a tick with the same key only calls setNow and keeps focus", () => {
    const host = createViewHost();
    document.body.append(host);
    const build = vi.fn(view);
    host.show("in:B", build, new Date(1));
    const first = host.firstElementChild;
    const input = first.querySelector("textarea");
    input.focus();
    expect(document.activeElement).toBe(input);
    host.show("in:B", build, new Date(2));
    expect(build).toHaveBeenCalledTimes(1);
    expect(first.setNow).toHaveBeenCalledWith(new Date(2));
    expect(host.firstElementChild).toBe(first);
    expect(document.activeElement).toBe(input);
    host.remove();
  });

  it("rebuilds and disposes the old view when the key changes", () => {
    const host = createViewHost();
    host.show("break:1", view, new Date(1));
    const first = host.firstElementChild;
    host.show("in:C", view, new Date(2));
    expect(first.dispose).toHaveBeenCalled();
    expect(host.firstElementChild).not.toBe(first);
    expect(host.current).toBe(host.firstElementChild);
  });
});
