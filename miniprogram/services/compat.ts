// Mini Program JS runtimes may lack structuredClone. Domain projections are data objects.
if (typeof globalThis.structuredClone !== "function") {
  globalThis.structuredClone = function clone<T>(value: T): T {
    if (value === null || typeof value !== "object") return value;
    if (value instanceof Date) return new Date(value.getTime()) as T;
    if (Array.isArray(value)) return value.map((item) => clone(item)) as T;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) as T;
  };
}
