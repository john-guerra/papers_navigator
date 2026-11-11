import { exportMyPapers } from "../myPapersFile.js";
import { toEntries } from "./entries.js";

/**
 * The My Papers file (v3) of `state` (the page's stores, what the person sees) for another
 * device. Its versions come from `meta.preview` of those very values, so every value in the
 * file carries a version that describes it, also when an edit isn't recorded yet (tracking is
 * deferred) or its record couldn't be saved (storage full). Writes nothing.
 */
export function exportTransfer(
  state,
  meta,
  { deviceName, now = new Date() } = {},
) {
  return exportMyPapers(state, {
    device: meta.device,
    deviceName,
    sync: meta.preview(toEntries(state), now),
  });
}
