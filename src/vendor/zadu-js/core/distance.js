/**
 * src/core/distance.js
 * Distance calculation utilities
 */

/**
 * Calculate Euclidean distance between two points
 */
function euclideanDistance(point1, point2) {
  return Math.sqrt(
    point1.reduce((sum, val, i) => sum + Math.pow(val - point2[i], 2), 0)
  );
}

/**
 * Calculate pairwise distance matrix
 */
function calculateDistanceMatrix(data) {
  const n = data.length;
  const distMatrix = Array(n).fill(null).map(() => Array(n).fill(0));
  
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dist = euclideanDistance(data[i], data[j]);
      distMatrix[i][j] = dist;
      distMatrix[j][i] = dist;
    }
  }
  
  return distMatrix;
}

export {
  euclideanDistance,
  calculateDistanceMatrix
};