import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const checker = path.resolve("scripts/check-workspace-dependencies.mjs");

interface PackageDefinition {
  id: string;
  path: string;
  name: string;
  legacyRoot?: boolean;
  runtimeDependencies: string[];
  peerDependencies: string[];
  optionalPeerDependencies?: string[];
}

async function workspaceFixture(
  packages: PackageDefinition[],
  manifests: Record<string, Record<string, unknown>>
): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "octo-workspace-graph-"));
  await Promise.all([
    mkdir(path.join(root, "apps"), { recursive: true }),
    mkdir(path.join(root, "packages"), { recursive: true }),
  ]);
  for (const packagePath of Object.keys(manifests)) {
    if (packagePath !== ".") {
      await mkdir(path.join(root, packagePath), { recursive: true });
    }
  }
  await Promise.all([
    writeFile(
      path.join(root, "pnpm-workspace.yaml"),
      'packages:\n  - "apps/*"\n  - "packages/*"\n'
    ),
    writeFile(
      path.join(root, "workspace-packages.json"),
      `${JSON.stringify({ schemaVersion: 1, packages }, null, 2)}\n`
    ),
    ...Object.entries(manifests).map(([packagePath, manifest]) =>
      writeFile(
        path.join(root, packagePath, "package.json"),
        `${JSON.stringify(manifest, null, 2)}\n`
      )
    ),
  ]);
  return root;
}

async function checkerError(root: string): Promise<string> {
  try {
    await execFileAsync("node", [checker, "--root", root], { encoding: "utf8" });
    return "";
  } catch (error) {
    return String((error as { stderr?: string }).stderr ?? error);
  }
}

describe("workspace architecture", () => {
  it("matches the declared package dependency allowlist", async () => {
    const { stdout } = await execFileAsync("node", [checker], { encoding: "utf8" });
    expect(stdout).toContain("Workspace dependency graph valid: 11 packages");
  });

  it("rejects an undeclared pnpm workspace package", async () => {
    const root = await workspaceFixture(
      [{
        id: "a",
        path: "packages/a",
        name: "@fixture/a",
        runtimeDependencies: [],
        peerDependencies: [],
      }],
      {
        "packages/a": { name: "@fixture/a" },
        "packages/b": { name: "@fixture/b" },
      }
    );
    try {
      expect(await checkerError(root)).toContain(
        "workspace package packages/b is not declared"
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects duplicate package ids and paths", async () => {
    const root = await workspaceFixture(
      [
        {
          id: "a",
          path: "packages/a",
          name: "@fixture/a",
          runtimeDependencies: [],
          peerDependencies: [],
        },
        {
          id: "a",
          path: "packages/b",
          name: "@fixture/b",
          runtimeDependencies: [],
          peerDependencies: [],
        },
        {
          id: "c",
          path: "packages/a",
          name: "@fixture/c",
          runtimeDependencies: [],
          peerDependencies: [],
        },
      ],
      {
        "packages/a": { name: "@fixture/a" },
        "packages/b": { name: "@fixture/b" },
      }
    );
    try {
      const stderr = await checkerError(root);
      expect(stderr).toContain("duplicate workspace package id: a");
      expect(stderr).toContain("duplicate workspace package path: packages/a");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects every dependency type pointing back to the legacy root", async () => {
    const root = await workspaceFixture(
      [
        {
          id: "cli",
          path: ".",
          name: "@fixture/cli",
          legacyRoot: true,
          runtimeDependencies: [],
          peerDependencies: [],
        },
        {
          id: "runtime",
          path: "packages/runtime",
          name: "@fixture/runtime",
          runtimeDependencies: ["cli"],
          peerDependencies: [],
        },
        {
          id: "peer",
          path: "packages/peer",
          name: "@fixture/peer",
          runtimeDependencies: [],
          peerDependencies: ["cli"],
        },
        {
          id: "dev",
          path: "packages/dev",
          name: "@fixture/dev",
          runtimeDependencies: [],
          peerDependencies: [],
        },
      ],
      {
        ".": { name: "@fixture/cli" },
        "packages/runtime": {
          name: "@fixture/runtime",
          dependencies: { "@fixture/cli": "workspace:*" },
        },
        "packages/peer": {
          name: "@fixture/peer",
          peerDependencies: { "@fixture/cli": "*" },
        },
        "packages/dev": {
          name: "@fixture/dev",
          devDependencies: { "@fixture/cli": "workspace:*" },
        },
      }
    );
    try {
      const stderr = await checkerError(root);
      expect(stderr).toContain("runtime dependencies must not depend on legacy root");
      expect(stderr).toContain("peer peerDependencies must not depend on legacy root");
      expect(stderr).toContain("dev devDependencies must not depend on legacy root");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("requires configured internal peers to be optional", async () => {
    const root = await workspaceFixture(
      [
        {
          id: "profile",
          path: "packages/profile",
          name: "@fixture/profile",
          runtimeDependencies: [],
          peerDependencies: [],
        },
        {
          id: "cli",
          path: ".",
          name: "@fixture/cli",
          legacyRoot: true,
          runtimeDependencies: [],
          peerDependencies: ["profile"],
          optionalPeerDependencies: ["profile"],
        },
      ],
      {
        ".": {
          name: "@fixture/cli",
          peerDependencies: { "@fixture/profile": ">=1" },
        },
        "packages/profile": { name: "@fixture/profile" },
      }
    );
    try {
      expect(await checkerError(root)).toContain(
        "cli peer dependency on profile must be optional"
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("requires workspace protocol for internal dependencies", async () => {
    const root = await workspaceFixture(
      [
        {
          id: "a",
          path: "packages/a",
          name: "@fixture/a",
          runtimeDependencies: ["b"],
          peerDependencies: [],
        },
        {
          id: "b",
          path: "packages/b",
          name: "@fixture/b",
          runtimeDependencies: [],
          peerDependencies: [],
        },
      ],
      {
        "packages/a": {
          name: "@fixture/a",
          dependencies: { "@fixture/b": "^1.0.0" },
        },
        "packages/b": { name: "@fixture/b" },
      }
    );
    try {
      expect(await checkerError(root)).toContain(
        "a dependencies dependency on b must use workspace: protocol"
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects runtime dependency cycles", async () => {
    const root = await workspaceFixture(
      [
        {
          id: "a",
          path: "packages/a",
          name: "@fixture/a",
          runtimeDependencies: ["b"],
          peerDependencies: [],
        },
        {
          id: "b",
          path: "packages/b",
          name: "@fixture/b",
          runtimeDependencies: ["a"],
          peerDependencies: [],
        },
      ],
      {
        "packages/a": {
          name: "@fixture/a",
          dependencies: { "@fixture/b": "workspace:*" },
        },
        "packages/b": {
          name: "@fixture/b",
          dependencies: { "@fixture/a": "workspace:*" },
        },
      }
    );
    try {
      expect(await checkerError(root)).toContain(
        "workspace runtime dependency cycle: a -> b -> a"
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
