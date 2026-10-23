import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const DEFAULT_CONFERENCE = "ieeevis2026";

const conferencesDir = fileURLToPath(new URL("../../conferences/", import.meta.url));

export function getConferenceId(env = process.env) {
  return env.CONFERENCE || DEFAULT_CONFERENCE;
}

export function conferenceDir(id = getConferenceId()) {
  return `${conferencesDir}${id}/`;
}

export async function loadConferenceConfig(id = getConferenceId()) {
  return JSON.parse(await readFile(`${conferenceDir(id)}config.json`, "utf-8"));
}
