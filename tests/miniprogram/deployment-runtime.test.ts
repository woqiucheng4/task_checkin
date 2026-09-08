import { beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve, relative, isAbsolute } from "node:path";
import vm from "node:vm";

const root = resolve(import.meta.dirname, "../..");
const mini = resolve(root, "dist/miniprogram");
beforeAll(() => {
  execFileSync("npm", ["run", "build:deploy"], { cwd: root, stdio: "pipe" });
}, 30000);

function runtime() {
  const definitions: object[] = [];
  const context = vm.createContext({
    Page: (page: object) => definitions.push(page),
    Component: (component: object) => definitions.push(component),
    App: () => {},
    wx: {},
    console,
  });
  const cache = new Map<string, { exports: unknown }>();
  function load(file: string): unknown {
    const path = resolve(file);
    const rel = relative(mini, path);
    if (rel.startsWith("..") || isAbsolute(rel))
      throw new Error(`Mini Program imported outside its package: ${rel}`);
    if (cache.has(path)) return cache.get(path)?.exports;
    const module: { exports: unknown } = { exports: {} };
    cache.set(path, module);
    const run = vm.runInContext(
      `(function(require,module,exports){${readFileSync(path, "utf8")}\n})`,
      context,
    );
    run(
      (id: string) => {
        if (!id.startsWith(".")) throw new Error(`Unexpected external dependency: ${id}`);
        return load(resolve(dirname(path), id));
      },
      module,
      module.exports,
    );
    return module.exports;
  }
  return { load, definitions };
}

describe("deployable Mini Program package", () => {
  it("loads every registered page from CommonJS without outside-package imports", () => {
    const app = JSON.parse(readFileSync(resolve(mini, "app.json"), "utf8")) as { pages: string[] };
    const sandbox = runtime();
    sandbox.load(resolve(mini, "app.js"));
    for (const page of app.pages) sandbox.load(resolve(mini, `${page}.js`));
    expect(sandbox.definitions).toHaveLength(app.pages.length);
  });
  it("keeps shared theme dependencies inside the shipped package", () => {
    const sandbox = runtime();
    expect(sandbox.load(resolve(mini, "theme/tokens.js"))).toBeDefined();
  });
});
