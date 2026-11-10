import { readFile } from "node:fs/promises";
import { conferenceDir } from "../lib/conference.js";

// Every session of the program (pipeline/fetch_sessions.py), for the Live page's plenaries,
// panels and meetups (sessions without papers); [] for a conference without the file
let sessions = [];
try {
  sessions = JSON.parse(
    await readFile(`${conferenceDir()}data/sessions.json`, "utf-8"),
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
process.stdout.write(JSON.stringify(sessions));
