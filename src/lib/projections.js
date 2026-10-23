/** Returns copies of papers positioned by `projection` ({id: [x, y]}). */
export function applyProjection(papers, projection) {
  const positioned = [];
  let missing = 0;
  for (const paper of papers) {
    const xy = projection[paper.id];
    if (xy) positioned.push({ ...paper, x: xy[0], y: xy[1] });
    else missing++;
  }
  return { papers: positioned, missing };
}
