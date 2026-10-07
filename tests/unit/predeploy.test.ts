/**
 * scripts/predeploy.mjs (CODE3-08): the node_modules ↔ package-lock.json comparison that stops a deploy built with
 * stale dependencies. Pure function over the two lockfile objects; the git / CI checks only warn and are not tested.
 */
import { describe, expect, it } from "vitest";
import { lockDrift } from "../../scripts/predeploy.mjs";

const lock = {
  packages: {
    "": { name: "site", devDependencies: {} },
    "node_modules/astro": { version: "7.3.5" },
    "node_modules/vitest": { version: "5.0.3", dev: true },
    "node_modules/@esbuild/linux-x64": { version: "0.28.1", optional: true },
    "node_modules/some-peer": { version: "1.0.0", peer: true },
  },
};
const installed = (edit: (p: Record<string, { version: string }>) => void = () => {}) => {
  const packages: Record<string, { version: string }> = {
    "node_modules/astro": { version: "7.3.5" },
    "node_modules/vitest": { version: "5.0.3" },
  };
  edit(packages);
  return { packages };
};

describe("lockDrift", () => {
  it("matches: every required package installed at its locked version (other-platform optional / peer ones absent)", () => {
    expect(lockDrift(lock, installed())).toEqual([]);
  });

  it("reports a version bump that was pulled but not installed", () => {
    expect(
      lockDrift(
        lock,
        installed((p) => (p["node_modules/astro"] = { version: "7.2.0" })),
      ),
    ).toEqual(["astro is 7.2.0, package-lock.json wants 7.3.5"]);
  });

  it("reports a new dependency that is not installed and a removed one that still is", () => {
    expect(
      lockDrift(
        lock,
        installed((p) => delete p["node_modules/vitest"]),
      ),
    ).toEqual(["vitest 5.0.3 is not installed"]);
    expect(
      lockDrift(
        lock,
        installed((p) => (p["node_modules/left-pad"] = { version: "1.3.0" })),
      ),
    ).toEqual(["left-pad is installed but no longer in package-lock.json"]);
  });

  it("the real repository: node_modules matches package-lock.json after npm ci", async () => {
    const { existsSync, readFileSync } = await import("node:fs");
    if (!existsSync("node_modules/.package-lock.json")) return;
    const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
    expect(lockDrift(read("package-lock.json"), read("node_modules/.package-lock.json"))).toEqual([]);
  });
});
