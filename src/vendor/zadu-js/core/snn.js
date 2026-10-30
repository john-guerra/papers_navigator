/**
 * src/core/snn.js
 * Shared Nearest Neighbor (SNN) utilities for Steadiness & Cohesiveness metrics
 */

/**
 * Get k-nearest neighbor indices for each point
 * @param {number[][]} distMatrix - n×n distance matrix
 * @param {number} k - number of neighbors
 * @returns {number[][]} - array of k neighbor indices for each point (n × k)
 */
function getKNNIndices(distMatrix, k) {
  const n = distMatrix.length;
  const knnIndices = [];

  for (let i = 0; i < n; i++) {
    const distances = distMatrix[i]
      .map((dist, idx) => ({ idx, dist }))
      .filter(item => item.idx !== i);

    distances.sort((a, b) => a.dist - b.dist);
    knnIndices.push(distances.slice(0, k).map(item => item.idx));
  }

  return knnIndices;
}

/**
 * Compute weighted SNN similarity matrix
 * For pair (i,j): sum over shared neighbors m of (k+1-rank_i(m)) * (k+1-rank_j(m))
 * This matches the Python implementation in snc/helpers/snn_knn.py
 * @param {number[][]} knnIndices - k-NN indices for each point (n × k)
 * @param {number} k - number of neighbors
 * @returns {number[][]} - n×n SNN similarity matrix
 */
function computeSNNMatrix(knnIndices, k) {
  const n = knnIndices.length;
  const snnMatrix = Array(n).fill(null).map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let c = 0;
      // For each neighbor position m of point i
      for (let m = 0; m < k; m++) {
        // For each neighbor position n of point j
        for (let nn = 0; nn < k; nn++) {
          // If they share the same neighbor
          if (knnIndices[i][m] === knnIndices[j][nn]) {
            // Weight by inverse rank (higher for closer neighbors)
            c += (k + 1 - m) * (k + 1 - nn);
          }
        }
      }
      snnMatrix[i][j] = c;
      snnMatrix[j][i] = c;
    }
  }

  return snnMatrix;
}

/**
 * Normalize SNN matrix by its maximum value
 * @param {number[][]} snnMatrix - raw SNN matrix
 * @returns {number[][]} - normalized SNN matrix with values in [0, 1]
 */
function normalizeSNNMatrix(snnMatrix) {
  const n = snnMatrix.length;
  let maxVal = 0;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (snnMatrix[i][j] > maxVal) {
        maxVal = snnMatrix[i][j];
      }
    }
  }

  if (maxVal === 0) maxVal = 1;

  const normalized = Array(n).fill(null).map(() => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      normalized[i][j] = snnMatrix[i][j] / maxVal;
    }
  }

  return normalized;
}

/**
 * Compute SNN-based distance matrix: 1 / (snn_similarity + alpha)
 * @param {number[][]} snnMatrix - normalized SNN matrix
 * @param {number} alpha - small constant to avoid division by zero
 * @returns {number[][]} - SNN distance matrix
 */
function computeSNNDistanceMatrix(snnMatrix, alpha) {
  const n = snnMatrix.length;
  const distMatrix = Array(n).fill(null).map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      distMatrix[i][j] = 1 / (snnMatrix[i][j] + alpha);
    }
  }

  return distMatrix;
}

export { getKNNIndices, computeSNNMatrix, normalizeSNNMatrix, computeSNNDistanceMatrix };
