import { readFile } from "node:fs/promises";
import { conferenceDir } from "../lib/conference.js";

process.stdout.write(await readFile(`${conferenceDir()}data/embeddings.bin`));
