/**
 * src/core/randomWalk.js
 * Cluster extraction for Steadiness & Cohesiveness metrics
 * Matches the Python implementation in snc/helpers/snn_knn.py
 */

/**
 * Extract a cluster via SNN-guided BFS traversal
 * Uses acceptance probability based on SNN similarity
 *
 * @param {number[][]} knnIndices - k-NN indices for each point
 * @param {number[][]} snnMatrix - normalized SNN similarity matrix
 * @param {number} startIdx - starting point index
 * @param {number} walkNum - maximum number of visits
 * @returns {number[]} - indices of cluster members
 */
function extractCluster(knnIndices, snnMatrix, startIdx, walkNum) {
  const clusterMember = new Set([startIdx]);
  const queue = [startIdx];

  let visitNum = 0;

  while (visitNum < walkNum && queue.length > 0) {
    const i = queue.shift(); // Pop from front (BFS)
    const knns = knnIndices[i];

    for (const j of knns) {
      // Acceptance probability: higher SNN similarity = more likely to accept
      // probability of NOT accepting = 1 - snn_similarity
      const probability = 1 - snnMatrix[i][j];
      const dice = Math.random();

      if (dice > probability) {
        // Accept this neighbor
        queue.push(j);
        clusterMember.add(j);
        visitNum++;

        if (visitNum >= walkNum) break;
      }
    }
  }

  return Array.from(clusterMember);
}

export { extractCluster };
