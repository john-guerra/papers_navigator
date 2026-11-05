// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { scheme as vegaScheme } from "vega";
import {
  DEFAULT_SIMILARITY_SCHEME,
  OXBLOOD,
  SIMILARITY_SCHEME_GROUPS,
  SIMILARITY_SCHEME_KEY,
  createSimilaritySchemeSettings,
  isSimilarityScheme,
  SIMILARITY_DOMAIN,
  SIMILARITY_LEGEND_LABELS,
  similarityColorAt,
  similarityColorScale,
} from "../src/lib/similarityScheme.js";
import { similaritySchemeControl } from "../src/components/similaritySchemeControl.js";
import {
  scatterSpec,
  taperedLegend,
} from "../src/widgets/brushableScatterPlot.js";
import { STORAGE_ITEMS } from "../src/lib/about.js";
import { relevanceCuts } from "../src/lib/search.js";

const memoryStorage = (items = {}) => ({
  items,
  getItem: (k) => items[k] ?? null,
  setItem: (k, v) => (items[k] = v),
});
const names = SIMILARITY_SCHEME_GROUPS.flatMap((g) =>
  g.schemes.map((s) => s.name),
);

describe("similarity schemes (#166)", () => {
  it("defaults to the CHI navigator's brownbluegreen", () => {
    expect(DEFAULT_SIMILARITY_SCHEME).toBe("brownbluegreen");
  });

  it("offers our oxblood ramp and every continuous Vega scheme, grouped as Vega's docs", () => {
    expect(SIMILARITY_SCHEME_GROUPS.map((g) => g.label)).toEqual([
      "This site",
      "Sequential single-hue",
      "Sequential multi-hue",
      "Diverging",
      "Cyclical",
    ]);
    expect(names[0]).toBe(OXBLOOD);
    for (const n of [
      "brownbluegreen",
      "purpleorange",
      "viridis",
      "blues",
      "rainbow",
      "sinebow",
      "turbo",
    ])
      expect(names).toContain(n);
    expect(new Set(names).size).toBe(names.length);
    // Every Vega entry is a continuous scheme Vega knows (an interpolator)
    for (const n of names.slice(1))
      expect(typeof vegaScheme(n)).toBe("function");
  });

  it("validates names", () => {
    expect(isSimilarityScheme("purpleorange")).toBe(true);
    expect(isSimilarityScheme(OXBLOOD)).toBe(true);
    expect(isSimilarityScheme("category10")).toBe(false);
    expect(isSimilarityScheme("nope")).toBe(false);
  });

  it("is remembered per device and ignores unknown stored names", () => {
    const storage = memoryStorage();
    const store = createSimilaritySchemeSettings({ storage });
    expect(store.value).toBe("brownbluegreen");
    let events = 0;
    store.addEventListener("input", () => events++);
    store.set("purpleorange");
    expect(events).toBe(1);
    expect(createSimilaritySchemeSettings({ storage }).value).toBe(
      "purpleorange",
    );
    store.set("bogus");
    expect(store.value).toBe("brownbluegreen");
    const bad = memoryStorage({ [SIMILARITY_SCHEME_KEY]: '"category10"' });
    expect(createSimilaritySchemeSettings({ storage: bad }).value).toBe(
      "brownbluegreen",
    );
    expect(STORAGE_ITEMS.map((d) => d.key)).toContain(SIMILARITY_SCHEME_KEY);
  });

  it("maps a name to a Vega-Lite scale: a scheme, or the oxblood token range", () => {
    expect(similarityColorScale("purpleorange")).toEqual({
      scheme: "purpleorange",
    });
    expect(similarityColorScale(OXBLOOD)).toEqual({
      range: ["#c37b71", "#a7463d", "#75201a"],
    });
    expect(similarityColorScale(null)).toEqual(similarityColorScale(OXBLOOD));
  });

  it("samples the same colors Vega draws (for the histogram and the Options preview)", () => {
    const at = similarityColorAt("brownbluegreen");
    expect(at(0)).toBe(vegaScheme("brownbluegreen")(0));
    expect(at(1)).toBe(vegaScheme("brownbluegreen")(1));
    expect(similarityColorAt(OXBLOOD)(0)).toBe("rgb(195, 123, 113)");
  });
});

describe("scatterSpec with a similarity scheme", () => {
  const data = [
    { id: "a", x: 0, y: 0, score: 0.9 },
    { id: "b", x: 5, y: 5, score: 0.2 },
  ];
  const options = {
    color: "score",
    colorType: "quantitative",
    size: "score",
    scoreDomain: SIMILARITY_DOMAIN,
    legendLabels: SIMILARITY_LEGEND_LABELS,
  };

  it("colors similarity with the Vega scheme over the fixed domain", () => {
    const scale = scatterSpec(data, {
      ...options,
      similarityScheme: "purpleorange",
    }).encoding.color.condition.scale;
    expect(scale.scheme).toBe("purpleorange");
    expect(scale.range).toBeUndefined();
    expect(scale.domain).toEqual([0, 0.6]);
    expect(scale.clamp).toBe(true);
    expect(
      taperedLegend({ ...options, similarityScheme: "purpleorange" }),
    ).toBe(true);
  });

  it("leaves categorical color alone", () => {
    const spec = scatterSpec([{ id: "a", x: 0, y: 0, type: "full" }], {
      color: "type",
      similarityScheme: "purpleorange",
    });
    expect(spec.encoding.color.condition.scale.scheme).toBeUndefined();
  });
});

describe("SIMILARITY_DOMAIN (#184: the same color means the same % in every search)", () => {
  it("is 0 → 60%, its midpoint the search's Good cut, so diverging schemes split at Good", () => {
    expect(SIMILARITY_DOMAIN).toEqual([0, 0.6]);
    const scores = [0.62, 0.5, 0.41, 0.36, 0.33, 0.31, 0.2, 0.1];
    expect((SIMILARITY_DOMAIN[0] + SIMILARITY_DOMAIN[1]) / 2).toBeCloseTo(
      relevanceCuts(scores).good,
    );
  });

  it("is labelled with fixed ticks at its ends and midpoint", () => {
    expect(SIMILARITY_LEGEND_LABELS).toEqual(["0%", "30% (Good)", "60%+"]);
  });
});

describe("similaritySchemeControl", () => {
  it("is a select with one optgroup per family, bound to the store both ways", () => {
    const store = createSimilaritySchemeSettings({ storage: memoryStorage() });
    const el = similaritySchemeControl(store);
    document.body.append(el);
    const select = el.querySelector("select");
    expect(select.querySelectorAll("optgroup")).toHaveLength(5);
    expect(select.value).toBe("brownbluegreen");
    select.value = "purpleorange";
    select.dispatchEvent(new Event("change"));
    expect(store.value).toBe("purpleorange");
    store.set("viridis");
    expect(select.value).toBe("viridis");
    expect(el.querySelector(".similarity-scheme-preview")).not.toBeNull();
    el.dispose();
    el.remove();
  });
});
