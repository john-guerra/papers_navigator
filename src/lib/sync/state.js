import { createAttendedStore } from "../attended.js";
import { createDislikedStore } from "../disliked.js";
import { createFollowedStore } from "../followed.js";
import { createNotesStore } from "../notes.js";
import { createRatingsStore } from "../ratings.js";
import { createRulesStore } from "../rules.js";

/**
 * What every synced store holds in `storage` now, read with the stores' own parsing (they are
 * created without listening to other tabs, and reading writes nothing). The shape `toEntries`
 * and `exportMyPapers` take: `{followed, rules, exceptions, notes, ratings, disliked, attended}`.
 */
export function readState(conferenceId, storage = globalThis.localStorage) {
  const { rules, exceptions } = createRulesStore(
    conferenceId,
    storage,
    null,
  ).value;
  return {
    followed: createFollowedStore(conferenceId, storage, null).value,
    rules,
    exceptions,
    notes: createNotesStore(conferenceId, storage, null).value,
    ratings: createRatingsStore(conferenceId, storage, null).value,
    disliked: createDislikedStore(conferenceId, storage, null).value,
    attended: createAttendedStore(conferenceId, storage, null).value,
  };
}
