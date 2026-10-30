import { isEntry } from "./followed.js";

/** My Papers export format v2: hand-added papers, watch rules and exceptions together (#49). */
export function exportMyPapers({ followed, rules = [], exceptions = [] }) {
  return JSON.stringify({ version: 2, followed, rules, exceptions }, null, 2);
}

/**
 * Note shown by Export when the file will carry "My research" abstracts (#27): they stay out of
 * share links, so the export is the one place they leave the browser. "" when there are none.
 */
export function exportNote(rules = []) {
  return rules.some((r) => r.research?.length)
    ? "Includes the abstracts of your research topics"
    : "";
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
  if (Array.isArray(data)) return { followed: data, rules: [], exceptions: [] };
  if (data && Array.isArray(data.followed))
    return {
      followed: data.followed,
      rules: Array.isArray(data.rules) ? data.rules : [],
      exceptions: Array.isArray(data.exceptions) ? data.exceptions : [],
    };
  throw new Error("This file is not a My Papers export.");
}
