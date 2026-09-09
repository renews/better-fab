import { randomUUID } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
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
const firefoxExtensionDirectoryName = "firefox";

type Target = "chrome" | "firefox";

type PackageOptions = {
  outputDirectory: string;
  target: Target;
};

async function main(): Promise<void> {
  const { outputDirectory, target } = parseOptions(Bun.argv.slice(2));
  const manifest = (await Bun.file(
    join(repositoryRoot, "manifest.json"),
  ).json()) as Record<string, unknown>;

  if (
    typeof manifest.version !== "string" ||
    !/^\d+(?:\.\d+)*$/.test(manifest.version)
  ) {
    throw new Error("manifest.json must contain a numeric version string");
  }

  const runtimeFileContents = await readRuntimeFileContents(manifest, target);
  const archive = createArchive(runtimeFileContents);
  await mkdir(outputDirectory, { recursive: true });
  if (target === "firefox") {
    await writeFirefoxExtensionDirectory(outputDirectory, runtimeFileContents);
  }

  const archivePath = join(
    outputDirectory,
    archiveFileName(target, manifest.version),
  );
  const temporaryArchivePath = join(
    outputDirectory,
    `.${archiveFileName(target, manifest.version)}.${randomUUID()}.tmp.zip`,
  );

  try {
    await Bun.write(temporaryArchivePath, archive);
    await rename(temporaryArchivePath, archivePath);
    console.log(archivePath);
  } finally {
    await rm(temporaryArchivePath, { force: true });
  }
}

async function readRuntimeFileContents(
  manifest: Record<string, unknown>,
  target: Target,
): Promise<Record<string, Uint8Array>> {
  const contents: Record<string, Uint8Array> = {};
  for (const file of runtimeFiles) {
    contents[file] =
      file === "manifest.json" && target === "firefox"
        ? new TextEncoder().encode(
            `${JSON.stringify(createFirefoxManifest(manifest), null, 2)}\n`,
          )
        : new Uint8Array(
            await Bun.file(join(repositoryRoot, file)).arrayBuffer(),
          );
  }

  return contents;
}

function createFirefoxManifest(manifest: Record<string, unknown>) {
  const { background: _background, update_url: _updateUrl, ...sharedManifest } =
    manifest;

  return {
    ...sharedManifest,
    background: { scripts: ["background.js"] },
    browser_specific_settings: {
      gecko: {
        id: "better-fab@renews",
        strict_min_version: "140.0",
        data_collection_permissions: { required: ["none"] },
      },
    },
  };
}

function createArchive(runtimeFileContents: Record<string, Uint8Array>): Uint8Array {
  const archiveFiles: Zippable = {};
  for (const file of runtimeFiles) {
    archiveFiles[file] = [
      runtimeFileContents[file],
      { mtime: reproducibleTimestamp },
    ];
  }

  return zipSync(archiveFiles, {
    level: 9,
    mtime: reproducibleTimestamp,
  });
}

async function writeFirefoxExtensionDirectory(
  outputDirectory: string,
  runtimeFileContents: Record<string, Uint8Array>,
): Promise<void> {
  const extensionDirectory = join(outputDirectory, firefoxExtensionDirectoryName);
  await mkdir(extensionDirectory, { recursive: true });

  for (const file of [
    ...runtimeFiles.filter((file) => file !== "manifest.json"),
    "manifest.json",
  ]) {
    await writeFileAtomically(
      join(extensionDirectory, file),
      runtimeFileContents[file],
    );
  }
}

async function writeFileAtomically(
  filePath: string,
  contents: Uint8Array,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryFilePath = `${filePath}.${randomUUID()}.tmp`;

  try {
    await Bun.write(temporaryFilePath, contents);
    await rename(temporaryFilePath, filePath);
  } finally {
    await rm(temporaryFilePath, { force: true });
  }
}

function archiveFileName(target: Target, version: string): string {
  return target === "firefox"
    ? `better-fab-firefox-release-${version}.zip`
    : `better-fab-release-${version}.zip`;
}

function parseOptions(args: string[]): PackageOptions {
  let outputDirectory = repositoryRoot;
  let target: Target = "chrome";

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (argument === "--output-dir" && value) {
      outputDirectory = resolve(repositoryRoot, value);
      index += 1;
      continue;
    }
    if (argument === "--target" && (value === "chrome" || value === "firefox")) {
      target = value;
      index += 1;
      continue;
    }

    throw new Error(
      "Usage: bun scripts/package-release.ts [--target chrome|firefox] [--output-dir <path>]",
    );
  }

  return { outputDirectory, target };
}

await main();
