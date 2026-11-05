// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { INTRO_KEY, rememberIntro } from "../src/components/intro.js";

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    data,
  };
}
const toggled = (details) =>
  new Promise((resolve) =>
    details.addEventListener("toggle", resolve, { once: true }),
  );

function setup(stored) {
  document.body.innerHTML = `<details class="lede" open><summary>Explore</summary><p>Search…</p></details>`;
  const details = document.querySelector("details");
  const root = document.documentElement;
  delete root.dataset.intro;
  const storage = memoryStorage(stored ? { [INTRO_KEY]: stored } : {});
  return { details, root, storage };
}

describe("rememberIntro (#174)", () => {
  it("stays open on a first visit and writes nothing", () => {
    const { details, root, storage } = setup();
    rememberIntro(details, { storage, root });
    expect(details.open).toBe(true);
    expect(root.dataset.intro).toBe("open");
    expect(storage.data.size).toBe(0);
  });

  it("starts closed once the person closed it", () => {
    const { details, root, storage } = setup("closed");
    rememberIntro(details, { storage, root });
    expect(details.open).toBe(false);
    expect(root.dataset.intro).toBe("closed");
    // style.css's fold before the page's JS ran no longer applies: the element folds itself
    expect(details.classList.contains("intro-ready")).toBe(true);
  });

  it("remembers closing and opening it again", async () => {
    const { details, root, storage } = setup();
    rememberIntro(details, { storage, root });
    let event = toggled(details);
    details.open = false;
    await event;
    expect(storage.data.get(INTRO_KEY)).toBe("closed");
    expect(root.dataset.intro).toBe("closed");
    event = toggled(details);
    details.open = true;
    await event;
    expect(storage.data.get(INTRO_KEY)).toBe("open");
    expect(root.dataset.intro).toBe("open");
  });

  it("works without storage (private mode)", async () => {
    const { details, root } = setup();
    const storage = {
      getItem() {
        throw new Error("SecurityError");
      },
      setItem() {
        throw new Error("SecurityError");
      },
    };
    const stop = rememberIntro(details, { storage, root });
    expect(details.open).toBe(true);
    const event = toggled(details);
    details.open = false;
    await event;
    expect(root.dataset.intro).toBe("closed");
    stop();
  });
});
