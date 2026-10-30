/**
 * Map animation settings (#82), remembered per browser. Only the choices the user made are
 * stored, so "Animate the map" keeps following `prefers-reduced-motion` until it is set.
 */
export const ANIMATION_KEY = "papersNavigator:animation";

/** Milliseconds per stage of the map animation. */
export const SPEEDS = { slow: 1200, normal: 700, fast: 400 };

const CHOICES = {
  enabled: [true, false],
  align: [true, false],
  filters: [true, false],
  motion: ["topic", "all"],
  speed: Object.keys(SPEEDS),
};

export const defaultAnimationSettings = ({ reducedMotion = false } = {}) => ({
  enabled: !reducedMotion,
  align: true,
  filters: true,
  motion: "topic",
  speed: "normal",
});

const valid = (choices) =>
  Object.fromEntries(
    Object.entries(choices ?? {}).filter(([key, value]) =>
      CHOICES[key]?.includes(value),
    ),
  );

function readChoices(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(ANIMATION_KEY) ?? "null");
    return parsed && typeof parsed === "object" ? valid(parsed) : {};
  } catch {
    return {};
  }
}

const prefersReducedMotion = () => {
  try {
    return Boolean(
      globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    );
  } catch {
    return false;
  }
};

/**
 * The settings as a reactive store: `.value` is the effective settings, `set(patch)` stores the
 * patch and emits `input` (like the followed store and theme.js).
 */
export function createAnimationSettings({
  storage = globalThis.localStorage,
  reducedMotion = prefersReducedMotion(),
} = {}) {
  const store = new EventTarget();
  let choices = readChoices(storage);
  const compute = () => ({
    ...defaultAnimationSettings({ reducedMotion }),
    ...choices,
  });
  store.value = compute();
  store.set = (patch) => {
    choices = { ...choices, ...valid(patch) };
    try {
      storage?.setItem(ANIMATION_KEY, JSON.stringify(choices));
    } catch {
      // Private mode etc.: the choice still applies for this page view
    }
    store.value = compute();
    store.dispatchEvent(new Event("input"));
  };
  return store;
}

/**
 * How the next map redraw animates, or null for no animation: projection switches (including
 * turning alignment on or off) animate whenever animation is on, staged by `stageOf` (topic)
 * when Motion is By topic; filter changes animate in one stage if "Animate filter changes" is on.
 */
export function mapAnimation(
  settings,
  { projectionChanged = false, stageOf = null } = {},
) {
  if (!settings.enabled || (!projectionChanged && !settings.filters))
    return null;
  return {
    duration: SPEEDS[settings.speed] ?? SPEEDS.normal,
    stageOf: projectionChanged && settings.motion === "topic" ? stageOf : null,
  };
}
