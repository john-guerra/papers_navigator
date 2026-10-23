import embed from "vega-embed";
import { falsy, truthy } from "vega";

/**
 * Turns any interactive Vega/Vega-Lite spec into a reactive widget: `.value` holds the
 * current value of every non-empty signal and an `input` event fires when one changes.
 * Local adapter with the contract of John's npm `vega-selected`; v0.0.3 imports
 * `container` from vega-embed, which current vega-embed releases no longer export.
 */
export async function vegaSelected(spec, { renderer = "canvas", signal = null } = {}) {
  const element = document.createElement("div");
  const { view } = await embed(element, spec, { renderer, actions: false });

  let value = {};
  const onSignal = (name, signalValue) => {
    if (signal) {
      if (name === signal) value = signalValue;
    } else if (signalValue === null || Object.keys(signalValue).length === 0) {
      delete value[name];
    } else {
      value[name] = signalValue;
    }
    element.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const signals = Object.keys(view.getState({ data: falsy, signals: truthy, recurse: true }).signals);
  for (const name of signals) view.addSignalListener(name, onSignal);

  Object.defineProperty(element, "value", {
    get: () => value,
    set: (v) => {
      value = v;
    },
  });
  element.view = view;
  return element;
}
