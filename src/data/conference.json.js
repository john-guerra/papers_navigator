import { loadConferenceConfig } from "../lib/conference.js";

process.stdout.write(JSON.stringify(await loadConferenceConfig()));
