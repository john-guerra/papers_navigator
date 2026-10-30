import { loadConferenceConfig, publicConfig } from "../lib/conference.js";

process.stdout.write(JSON.stringify(publicConfig(await loadConferenceConfig())));
