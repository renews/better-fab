import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync } from "fflate";

const repositoryRoot = join(import.meta.dir, "..");
const temporaryDirectories: string[] = [];
const expectedArchiveFiles = [
  "LICENSE.md",
  "background.js",
  "content.js",
  "logo128.png",
  "logo16.png",
	"logo48.png",
	"manifest.json",
	"modules/fab-dom-adapter.js",
	"modules/mass-add.js",
	"modules/processing-coordinator.js",
	"modules/seller-profile.js",
	"popup.html",
  "popup.js",
  "styles.css",
];

const expectedFirefoxManifest = {
	manifest_version: 3,
	version: "1.1.4",
	background: { scripts: ["background.js"] },
	browser_specific_settings: {
		gecko: {
			id: "better-fab@renews",
			strict_min_version: "140.0",
			data_collection_permissions: { required: ["none"] },
		},
	},
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

test("release command produces a lean deterministic Chrome Web Store archive", async () => {
  const firstOutput = await createTemporaryDirectory();
  const secondOutput = await createTemporaryDirectory();

  await runPackager(firstOutput);
  await Bun.sleep(2_100);
  await runPackager(secondOutput);

  const archiveName = "better-fab-release-1.1.4.zip";
  expect(await readdir(firstOutput)).toEqual([archiveName]);
  expect(await listArchive(join(firstOutput, archiveName))).toEqual(
    expectedArchiveFiles,
  );
  expect((await stat(join(firstOutput, archiveName))).size).toBeLessThan(250_000);
  expect(await hashFile(join(firstOutput, archiveName))).toBe(
    await hashFile(join(secondOutput, archiveName)),
  );
});

test("Firefox release command creates a loadable Firefox directory and archive", async () => {
	const outputDirectory = await createTemporaryDirectory();

	await runFirefoxPackager(outputDirectory);

	const archiveName = "better-fab-firefox-release-1.1.4.zip";
	const firefoxDirectory = join(outputDirectory, "firefox");
	expect(await readdir(outputDirectory)).toEqual([archiveName, "firefox"]);
	expect(await listArchive(join(outputDirectory, archiveName))).toEqual(
		expectedArchiveFiles,
	);

	const firefoxManifest = await Bun.file(
		join(firefoxDirectory, "manifest.json"),
	).json();
	expect(firefoxManifest).toMatchObject(expectedFirefoxManifest);
	expect(firefoxManifest.update_url).toBeUndefined();
	expect(firefoxManifest.background.service_worker).toBeUndefined();

	const archive = unzipSync(
		new Uint8Array(
			await Bun.file(join(outputDirectory, archiveName)).arrayBuffer(),
		),
	);
	for (const file of expectedArchiveFiles) {
		expect(
			new Uint8Array(await Bun.file(join(firefoxDirectory, file)).arrayBuffer()),
		).toEqual(archive[file]);
	}

	for (const file of expectedArchiveFiles.filter(
		(file) => file !== "manifest.json",
	)) {
		expect(await readFile(join(firefoxDirectory, file))).toEqual(
			await readFile(join(repositoryRoot, file)),
		);
	}
});

test("Firefox release command keeps unrelated files in its output directory", async () => {
	const outputDirectory = await createTemporaryDirectory();
	await runFirefoxPackager(outputDirectory);

	const userFilePath = join(outputDirectory, "firefox", "LOCAL-NOTES.md");
	await Bun.write(userFilePath, "keep this file");
	await runFirefoxPackager(outputDirectory);

	expect(await Bun.file(userFilePath).text()).toBe("keep this file");
});

test("Firefox release command preserves existing artifacts when packaging fails", async () => {
	const fixtureDirectory = await createTemporaryDirectory();
	await mkdir(join(fixtureDirectory, "scripts"), { recursive: true });
	await mkdir(join(fixtureDirectory, "node_modules"), { recursive: true });
	await mkdir(join(fixtureDirectory, "firefox"), { recursive: true });
	await Promise.all([
		copyFile(
			join(repositoryRoot, "scripts/package-release.ts"),
			join(fixtureDirectory, "scripts/package-release.ts"),
		),
		cp(
			join(repositoryRoot, "node_modules/fflate"),
			join(fixtureDirectory, "node_modules/fflate"),
			{ recursive: true },
		),
		Bun.write(join(fixtureDirectory, "manifest.json"), '{"version":"1.1"}'),
	]);

	const archivePath = join(
		fixtureDirectory,
		"better-fab-firefox-release-1.1.zip",
	);
	const manifestPath = join(fixtureDirectory, "firefox", "manifest.json");
	await Promise.all([
		Bun.write(archivePath, "known-good-release"),
		Bun.write(manifestPath, "known-good-manifest"),
	]);

	const child = Bun.spawn(
		[
			process.execPath,
			"scripts/package-release.ts",
			"--target",
			"firefox",
			"--output-dir",
			fixtureDirectory,
		],
		{
			cwd: fixtureDirectory,
			stderr: "pipe",
			stdout: "pipe",
		},
	);

	expect(await child.exited).not.toBe(0);
	expect(await Bun.file(archivePath).text()).toBe("known-good-release");
	expect(await Bun.file(manifestPath).text()).toBe("known-good-manifest");
});

test("release command preserves an existing archive when packaging fails", async () => {
  const fixtureDirectory = await createTemporaryDirectory();
  await mkdir(join(fixtureDirectory, "scripts"), { recursive: true });
  await mkdir(join(fixtureDirectory, "node_modules"), { recursive: true });
  await Promise.all([
    copyFile(
      join(repositoryRoot, "scripts/package-release.ts"),
      join(fixtureDirectory, "scripts/package-release.ts"),
    ),
    cp(
      join(repositoryRoot, "node_modules/fflate"),
      join(fixtureDirectory, "node_modules/fflate"),
      { recursive: true },
    ),
    Bun.write(join(fixtureDirectory, "manifest.json"), '{"version":"1.1"}'),
  ]);

  const archivePath = join(fixtureDirectory, "better-fab-release-1.1.zip");
  const sentinel = "known-good-release";
  await Bun.write(archivePath, sentinel);

  const child = Bun.spawn(
    [
      process.execPath,
      "scripts/package-release.ts",
      "--output-dir",
      fixtureDirectory,
    ],
    {
      cwd: fixtureDirectory,
      stderr: "pipe",
      stdout: "pipe",
    },
  );
  const exitCode = await child.exited;

  expect(exitCode).not.toBe(0);
  expect(await Bun.file(archivePath).text()).toBe(sentinel);
});

test("release command works without system ZIP tools", async () => {
  const outputDirectory = await createTemporaryDirectory();
  const archivePath = join(outputDirectory, "better-fab-release-1.1.4.zip");
  const child = Bun.spawn(
    [process.execPath, "scripts/package-release.ts", "--output-dir", outputDirectory],
    {
      cwd: repositoryRoot,
      env: { ...process.env, PATH: "/missing" },
      stderr: "pipe",
      stdout: "pipe",
    },
  );
  const [exitCode, stderr] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ]);

  expect(exitCode, stderr).toBe(0);

  const archive = unzipSync(
    new Uint8Array(await Bun.file(archivePath).arrayBuffer()),
  );
	expect(Object.keys(archive).sort()).toEqual(expectedArchiveFiles);
});

test("release archive is reproducible across timezones", async () => {
	const utcOutput = await createTemporaryDirectory();
	const localOutput = await createTemporaryDirectory();

	await runPackager(utcOutput, { TZ: "UTC" });
	await runPackager(localOutput, { TZ: "America/Sao_Paulo" });

	const archiveName = "better-fab-release-1.1.4.zip";
	expect(await hashFile(join(utcOutput, archiveName))).toBe(
		await hashFile(join(localOutput, archiveName)),
	);
});

test("release metadata declares patch version 1.1.4", async () => {
	const manifest = await Bun.file(join(repositoryRoot, "manifest.json")).json();
	const storeListing = await Bun.file(
		join(repositoryRoot, "CHROMEWEBSTORE.md"),
	).text();
	const changelog = await Bun.file(
		join(repositoryRoot, "CHANGELOG.md"),
	).text();

	expect(manifest.version).toBe("1.1.4");
	expect(storeListing).toContain("Current Package Version: 1.1.4");
	expect(storeListing).toContain("| 1.1.4 | 2026-09-15 |");
	expect(changelog).toContain("## [1.1.4] - 2026-09-15");
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "better-fab-release-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function runPackager(
	outputDirectory: string,
	environment: Record<string, string> = {},
): Promise<void> {
	const child = Bun.spawn(
		["bun", "scripts/package-release.ts", "--output-dir", outputDirectory],
		{
			cwd: repositoryRoot,
			env: { ...process.env, ...environment },
			stderr: "pipe",
			stdout: "pipe",
		},
  );
  const [exitCode, stderr] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ]);

  expect(exitCode, stderr).toBe(0);
}

async function runFirefoxPackager(outputDirectory: string): Promise<void> {
	const child = Bun.spawn(
		[
			"bun",
			"scripts/package-release.ts",
			"--target",
			"firefox",
			"--output-dir",
			outputDirectory,
		],
		{
			cwd: repositoryRoot,
			stderr: "pipe",
			stdout: "pipe",
		},
	);
	const [exitCode, stderr] = await Promise.all([
		child.exited,
		new Response(child.stderr).text(),
	]);

	expect(exitCode, stderr).toBe(0);
}

async function listArchive(archivePath: string): Promise<string[]> {
  const archive = unzipSync(
    new Uint8Array(await Bun.file(archivePath).arrayBuffer()),
  );
  return Object.keys(archive).sort();
}

async function hashFile(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}
