import { randomUUID } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { zipSync, type Zippable } from "fflate";

const repositoryRoot = resolve(import.meta.dir, "..");
const runtimeFiles = [
  "manifest.json",
  "LICENSE.md",
  "background.js",
  "modules/fab-dom-adapter.js",
  "modules/mass-add.js",
  "modules/processing-coordinator.js",
  "modules/seller-profile.js",
  "content.js",
  "popup.html",
  "popup.js",
  "styles.css",
  "logo16.png",
  "logo48.png",
  "logo128.png",
] as const;
const reproducibleTimestamp = new Date(2000, 0, 1, 0, 0, 0);

async function main(): Promise<void> {
  const outputDirectory = parseOutputDirectory(Bun.argv.slice(2));
  const manifest = (await Bun.file(
    join(repositoryRoot, "manifest.json"),
  ).json()) as { version?: unknown };

  if (
    typeof manifest.version !== "string" ||
    !/^\d+(?:\.\d+)*$/.test(manifest.version)
  ) {
    throw new Error("manifest.json must contain a numeric version string");
  }

  await mkdir(outputDirectory, { recursive: true });
  const archivePath = join(
    outputDirectory,
    `better-fab-release-${manifest.version}.zip`,
  );
  const temporaryArchivePath = join(
    outputDirectory,
    `.better-fab-release-${manifest.version}.${randomUUID()}.tmp.zip`,
  );

  try {
    const archiveFiles: Zippable = {};
    for (const file of runtimeFiles) {
      archiveFiles[file] = [
        new Uint8Array(
          await Bun.file(join(repositoryRoot, file)).arrayBuffer(),
        ),
        { mtime: reproducibleTimestamp },
      ];
    }

    const archive = zipSync(archiveFiles, {
      level: 9,
      mtime: reproducibleTimestamp,
    });
    await Bun.write(temporaryArchivePath, archive);
    await rename(temporaryArchivePath, archivePath);
    console.log(archivePath);
  } finally {
    await rm(temporaryArchivePath, { force: true });
  }
}

function parseOutputDirectory(args: string[]): string {
  if (args.length === 0) {
    return repositoryRoot;
  }

  if (args.length === 2 && args[0] === "--output-dir" && args[1]) {
    return resolve(repositoryRoot, args[1]);
  }

  throw new Error("Usage: bun scripts/package-release.ts [--output-dir <path>]");
}

await main();
