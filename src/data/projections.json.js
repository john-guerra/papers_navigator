import { readFile } from "node:fs/promises";
import { conferenceDir, loadConferenceConfig } from "../lib/conference.js";

const { projections = [] } = await loadConferenceConfig();
const result = {};
for (const method of projections) {
  result[method] = JSON.parse(
    await readFile(`${conferenceDir()}data/projections/${method}.json`, "utf-8"),
  );
}
process.stdout.write(JSON.stringify(result));
