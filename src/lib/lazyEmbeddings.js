/**
 * The paper embeddings (~750 KB, not compressible) off Explore's critical path (#124): nothing
 * on the first screen needs them (the list and the map come from papers.json and the
 * projections), only search by meaning, My research, nearest neighbours, related papers and
 * the Advanced panel. `load()` fetches them once, on demand or right after the first render;
 * until then `matrix` and `dims` are null. A failed load (offline) is forgotten, so the next
 * call tries again.
 */
import { toMatrix } from "./search.js";

export function createLazyEmbeddings(fetchBuffer, count, { dims } = {}) {
  let pending = null;
  const state = {
    matrix: null,
    dims: null,
    load() {
      pending ??= Promise.resolve()
        .then(fetchBuffer)
        .then((buffer) => {
          const d = dims ?? buffer.byteLength / 4 / count;
          state.matrix = toMatrix(buffer, count, d);
          state.dims = d;
          return state;
        })
        .catch((error) => {
          pending = null;
          throw error;
        });
      return pending;
    },
  };
  return state;
}
