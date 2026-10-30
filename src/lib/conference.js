import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const DEFAULT_CONFERENCE = "ieeevis2026";

const conferencesDir = fileURLToPath(
  new URL("../../conferences/", import.meta.url),
);

export function getConferenceId(env = process.env) {
  return env.CONFERENCE || DEFAULT_CONFERENCE;
}

export function conferenceDir(id = getConferenceId()) {
  return `${conferencesDir}${id}/`;
}

export async function loadConferenceConfig(id = getConferenceId()) {
  return JSON.parse(await readFile(`${conferenceDir(id)}config.json`, "utf-8"));
}

/** Config keys only the deploy script needs; never shipped to the browser. */
const SERVER_ONLY = ["deployDir", "legacyDirs", "deployPath"];

export function publicConfig(config) {
  return Object.fromEntries(
    Object.entries(config).filter(([key]) => !SERVER_ONLY.includes(key)),
  );
}
