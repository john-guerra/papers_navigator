import { isEntry } from "./followed.js";
import { cleanNotes } from "./notes.js";
import { cleanRatings } from "./ratings.js";

/**
 * My Papers export format v2: hand-added papers, watch rules and exceptions together (#49),
 * paper notes (#152, `{paperId: text}`, on any paper) and ratings (#203, `{paperId: 1..5}`);
 * older versions ignore the fields they don't know.
 */
export function exportMyPapers({
  followed,
  rules = [],
  exceptions = [],
  notes = {},
  ratings = {},
}) {
  return JSON.stringify(
    { version: 2, followed, rules, exceptions, notes, ratings },
    null,
    2,
  );
}

/**
 * Note shown by Export when the file will carry private text, "My research" abstracts (#27) or
 * paper notes (#152): they stay out of share links, so the export is the one place they leave
 * the browser. "" when there are none.
 */
export function exportNote(rules = [], notes = {}, ratings = {}) {
  const parts = [
    Object.keys(notes).length && "your notes",
    Object.keys(ratings).length && "your ratings",
    rules.some((r) => r.research?.length) &&
      "the abstracts of your research topics",
  ].filter(Boolean);
  return parts.length ? `Includes ${parts.join(" and ")}` : "";
}

/**
 * Reads an exported My Papers file: v2 objects or the original plain list of followed papers.
 * Throws on anything else, so imports fail loudly instead of silently changing the list.
 */
export function parseMyPapersFile(text) {
  const data = JSON.parse(text);
  const papers = Array.isArray(data) ? data : data?.followed;
  if (Array.isArray(papers) && !papers.every(isEntry))
    throw new Error("Some papers in this file are missing their id.");
  if (Array.isArray(data))
    return {
      followed: data,
      rules: [],
      exceptions: [],
      notes: {},
      ratings: {},
    };
  if (data && Array.isArray(data.followed))
    return {
      followed: data.followed,
      rules: Array.isArray(data.rules) ? data.rules : [],
      exceptions: Array.isArray(data.exceptions) ? data.exceptions : [],
      notes: cleanNotes(data.notes),
      ratings: cleanRatings(data.ratings),
    };
  throw new Error("This file is not a My Papers export.");
}
