import { expect, test } from "bun:test";

const coordinatorSource = await Bun.file(
	new URL("../modules/processing-coordinator.js", import.meta.url),
).text();

function createHarness({ active = true } = {}) {
	const moduleGlobal = {};
	new Function("globalThis", coordinatorSource)(moduleGlobal);
	const timers = [];
	const idleCallbacks = [];
	const reconciliations = [];
	let now = 1_000;
	let lastReconciliation = { completedAt: 0, signature: "" };
	let processingState = { hasWork: true, pathname: "/search" };
	let currentActive = active;
	let initialSignals = false;
	let listingSignature = "listing-signature";
	let potentialWork = true;

	const coordinator = moduleGlobal.BetterFabModules.processingCoordinator.create({
		getLastReconciliation: () => lastReconciliation,
		getListingSignature: () => listingSignature,
		getProcessingState: () => processingState,
		hasInitialSignals: () => initialSignals,
		hasPotentialWork: () => potentialWork,
		isActive: () => currentActive,
		now: () => now,
		reconcile(request) {
			reconciliations.push(request);
		},
		requestIdle(callback) {
			idleCallbacks.push(callback);
			return idleCallbacks.length;
		},
		setTimer(callback, delay) {
			timers.push({ callback, delay });
			return timers.length;
		},
	});

	return {
		coordinator,
		idleCallbacks,
		reconciliations,
		timers,
		setActive(value) {
			currentActive = value;
		},
		setInitialSignals(value) {
			initialSignals = value;
		},
		setLastReconciliation(value) {
			lastReconciliation = value;
		},
		setListingSignature(value) {
			listingSignature = value;
		},
		setNow(value) {
			now = value;
		},
		setPotentialWork(value) {
			potentialWork = value;
		},
		setProcessingState(value) {
			processingState = value;
		},
	};
}

test("processing coordinator coalesces mutation cards behind one timer and idle pass", () => {
	const harness = createHarness();
	const firstCard = { id: "first" };
	const secondCard = { id: "second" };

	harness.coordinator.request({
		cards: new Set([firstCard]),
		cause: "mutation",
	});
	harness.coordinator.request({
		cards: new Set([secondCard]),
		cause: "mutation",
	});

	expect(harness.timers).toHaveLength(1);
	harness.timers[0].callback();
	expect(harness.idleCallbacks).toHaveLength(1);
	harness.idleCallbacks[0]();

	expect(harness.reconciliations).toHaveLength(1);
	expect([...harness.reconciliations[0].targetCards]).toEqual([
		firstCard,
		secondCard,
	]);
});

test("processing coordinator routes inactive immediate requests through cleanup", () => {
	const harness = createHarness({ active: false });

	harness.coordinator.request({ cause: "storage" });

	expect(harness.reconciliations).toEqual([
		{
			listingSetSignature: null,
			processingState: null,
			targetCards: null,
		},
	]);
});

test("processing coordinator preserves full-scan requests for product-only mutations", () => {
	const harness = createHarness();

	harness.coordinator.request({ cause: "mutation", forceFullScan: true });
	harness.timers[0].callback();
	harness.idleCallbacks[0]();

	expect(harness.reconciliations).toEqual([
		{
			listingSetSignature: null,
			processingState: { hasWork: true, pathname: "/search" },
			targetCards: null,
		},
	]);
});

test("processing coordinator suppresses a recent unchanged empty mutation pass", () => {
	const harness = createHarness();
	harness.setLastReconciliation({
		completedAt: 900,
		signature: "listing-signature",
	});

	harness.coordinator.request({ cause: "mutation" });
	harness.timers[0].callback();

	expect(harness.idleCallbacks).toHaveLength(0);
	expect(harness.reconciliations).toHaveLength(0);
});

test("processing coordinator owns and coalesces startup retries", () => {
	const harness = createHarness();

	harness.coordinator.request({ cause: "startup" });
	harness.coordinator.request({ cause: "startup" });

	expect(harness.timers.map((timer) => timer.delay)).toEqual([300]);
	harness.timers[0].callback();
	expect(harness.reconciliations).toHaveLength(1);
	expect(harness.timers.map((timer) => timer.delay)).toEqual([300, 300]);

	harness.setInitialSignals(true);
	harness.timers[1].callback();
	expect(harness.reconciliations).toHaveLength(2);
	expect(harness.timers).toHaveLength(2);
});

test("extension loads processing coordinator before the content adapter", async () => {
	const manifest = await Bun.file(
		new URL("../manifest.json", import.meta.url),
	).json();

	expect(manifest.content_scripts[0].js).toEqual([
		"modules/fab-dom-adapter.js",
		"modules/seller-profile.js",
		"modules/mass-add.js",
		"modules/processing-coordinator.js",
		"content.js",
	]);
});
