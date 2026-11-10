import { readFile } from "node:fs/promises";
import { conferenceDir, loadConferenceConfig } from "../lib/conference.js";
import { enrichPapers } from "../lib/paperMeta.js";

// The pipeline's papers plus the fields every page derives the same way (#199: day, award tier,
// type pill)
const papers = JSON.parse(
  await readFile(`${conferenceDir()}data/papers.json`, "utf-8"),
);
process.stdout.write(
  JSON.stringify(enrichPapers(papers, await loadConferenceConfig())),
);
