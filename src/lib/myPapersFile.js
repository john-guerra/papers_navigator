/** My Papers export format v2: hand-added papers, watch rules and exceptions together (#49). */
export function exportMyPapers({ followed, rules = [], exceptions = [] }) {
  return JSON.stringify({ version: 2, followed, rules, exceptions }, null, 2);
}

/**
 * Reads an exported My Papers file: v2 objects or the original plain list of followed papers.
 * Throws on anything else, so imports fail loudly instead of silently changing the list.
 */
export function parseMyPapersFile(text) {
  const data = JSON.parse(text);
  if (Array.isArray(data)) return { followed: data, rules: [], exceptions: [] };
  if (data && Array.isArray(data.followed))
    return {
      followed: data.followed,
      rules: Array.isArray(data.rules) ? data.rules : [],
      exceptions: Array.isArray(data.exceptions) ? data.exceptions : [],
    };
  throw new Error("This file is not a My Papers export.");
}
