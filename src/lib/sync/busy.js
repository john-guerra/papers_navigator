let depth = 0;

/** True while an import, undo or snapshot restore is writing the stores. */
export const isBusy = () => depth > 0;

/** Wraps `fn` so tracking doesn't reconcile half-written data while it runs. */
export function busy(fn) {
  return (...args) => {
    depth++;
    try {
      return fn(...args);
    } finally {
      depth--;
    }
  };
}
