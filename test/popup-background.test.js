import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const POPUP_SOURCE = readFileSync(
	new URL("../popup.js", import.meta.url),
	"utf8",
);
const BACKGROUND_SOURCE = readFileSync(
	new URL("../background.js", import.meta.url),
	"utf8",
);

async function waitFor(predicate) {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		if (predicate()) return;
		await Bun.sleep(0);
	}

	throw new Error("Timed out waiting for browser-script work");
}

function createDeferred() {
	let resolve;
	let reject;
	const promise = new Promise((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, reject, resolve };
}

class FakeClassList {
	#classes = new Set();

	add(...classes) {
		for (const className of classes) this.#classes.add(className);
	}

	toggle(className, force) {
		if (force === undefined) {
			if (this.#classes.has(className)) {
				this.#classes.delete(className);
				return false;
			}

			this.#classes.add(className);
			return true;
		}

		if (force) this.#classes.add(className);
		else this.#classes.delete(className);
		return force;
	}

	contains(className) {
		return this.#classes.has(className);
	}
}

class FakeElement {
	constructor(tagName = "div", id = "") {
		this.tagName = tagName.toUpperCase();
		this.id = id;
		this.style = {};
		this.classList = new FakeClassList();
		this.children = [];
		this.listeners = new Map();
		this.attributes = new Map();
		this.textContent = "";
		this.value = "";
		this.checked = false;
		this.disabled = false;
		this.hidden = false;
		this.files = [];
		this.onclick = null;
	}

	set innerHTML(_value) {
		this.children = [];
	}

	get innerHTML() {
		return "";
	}

	addEventListener(type, listener) {
		const listeners = this.listeners.get(type) || [];
		listeners.push(listener);
		this.listeners.set(type, listeners);
	}

	setAttribute(name, value) {
		this.attributes.set(name, String(value));
	}

	append(...children) {
		this.children.push(...children);
	}

	appendChild(child) {
		this.children.push(child);
		return child;
	}

	remove() {}

	querySelectorAll(selector) {
		const matches = [];
		const visit = (element) => {
			for (const child of element.children) {
				if (selector === "input" && child.tagName === "INPUT") {
					matches.push(child);
				}
				visit(child);
			}
		};
		visit(this);
		return matches;
	}

	async dispatch(type, eventOverrides = {}) {
		const event = {
			target: this,
			key: undefined,
			preventDefault() {},
			stopImmediatePropagation() {},
			...eventOverrides,
		};

		for (const listener of this.listeners.get(type) || []) {
			await listener(event);
		}

		if (type === "click" && this.onclick) await this.onclick(event);
	}

	click() {
		return this.dispatch("click");
	}
}

function createPopupDocument() {
	const ids = [
		"app-content",
		"wrong-site-message",
		"error-message",
		"toggle-saved",
		"toggle-saved-seller-page",
		"toggle-hide-seller-buttons",
		"toggle-library-seller",
		"toggle-star-review-sort",
		"min-reviews-input",
		"preset-list",
		"extension-state",
		"add-free-library-btn",
		"seller-input",
		"add-seller-btn",
		"seller-list",
		"keyword-input",
		"add-keyword-btn",
		"keyword-list",
		"apply-presets-btn",
		"disable-presets-btn",
		"export-sellers-btn",
		"import-sellers-btn",
		"seller-import-file",
		"export-keywords-btn",
		"import-keywords-btn",
		"keyword-import-file",
	];
	const inputIds = new Set([
		"toggle-saved",
		"toggle-saved-seller-page",
		"toggle-hide-seller-buttons",
		"toggle-library-seller",
		"toggle-star-review-sort",
		"min-reviews-input",
		"seller-input",
		"keyword-input",
		"seller-import-file",
		"keyword-import-file",
	]);
	const buttonIds = new Set([
		"add-free-library-btn",
		"add-seller-btn",
		"add-keyword-btn",
		"apply-presets-btn",
		"disable-presets-btn",
		"export-sellers-btn",
		"import-sellers-btn",
		"export-keywords-btn",
		"import-keywords-btn",
	]);
	const elements = new Map(
		ids.map((id) => [
			id,
			new FakeElement(
				inputIds.has(id) ? "input" : buttonIds.has(id) ? "button" : "div",
				id,
			),
		]),
	);
	const documentListeners = new Map();
	const body = new FakeElement("body");

	elements.get("wrong-site-message").style.display = "none";
	elements.get("error-message").style.display = "none";
	elements.get("error-message").hidden = true;
	elements.get("add-free-library-btn").textContent =
		"Add Displaying Free Items";
	elements.get("extension-state").textContent = "Extension: Inactive";

	return {
		body,
		elements,
		addEventListener(type, listener) {
			documentListeners.set(type, listener);
		},
		getElementById(id) {
			return elements.get(id) || null;
		},
		createElement(tagName) {
			return new FakeElement(tagName);
		},
		async start() {
			await documentListeners.get("DOMContentLoaded")();
		},
	};
}

function createPopupHarness({
	failAt,
	storageData = {},
	setStorage,
	sendMessage,
} = {}) {
	const document = createPopupDocument();
	const alerts = [];
	const sentMessages = [];
	const storageWrites = [];
	const storageListeners = [];
	const chrome = {
		tabs: {
			async query(query) {
				if (failAt === "tabs") throw new Error("tabs unavailable");
				if (query.active) return [{ id: 7, url: "https://www.fab.com/" }];
				if (failAt === "broadcast") {
					throw new Error("Fab tab query unavailable");
				}
				return [];
			},
			async sendMessage(tabId, message) {
				sentMessages.push({ tabId, message });
				return sendMessage ? sendMessage(tabId, message) : undefined;
			},
		},
		storage: {
			local: {
				async get() {
					if (failAt === "storage") throw new Error("storage unavailable");
					return storageData;
				},
				async set(value) {
					storageWrites.push(structuredClone(value));
					if (setStorage) await setStorage(value, storageWrites.length);
				},
			},
			onChanged: {
				addListener(listener) {
					storageListeners.push(listener);
				},
			},
		},
		downloads: { async download() {} },
	};
	class FakeFileReader {
		readAsText(file) {
			queueMicrotask(() => {
				this.onload({ target: { result: file.contents } });
			});
		}
	}

	new Function(
		"document",
		"chrome",
		"alert",
		"FileReader",
		"console",
		POPUP_SOURCE,
	)(
		document,
		chrome,
		(message) => alerts.push(message),
		FakeFileReader,
		{ error() {} },
	);

	return {
		alerts,
		chrome,
		document,
		sentMessages,
		storageListeners,
		storageWrites,
	};
}

function createBackgroundHarness(storageRead) {
	const titleUpdates = [];
	let storageListener;
	const chrome = {
		action: {
			async setBadgeText() {},
			async setIcon() {},
			async setTitle(value) {
				titleUpdates.push(value);
			},
		},
		runtime: {
			getURL(path) {
				return `chrome-extension://better-fab/${path}`;
			},
		},
		storage: {
			local: {
				async get() {
					return storageRead.promise;
				},
				async set() {},
			},
			onChanged: {
				addListener(listener) {
					storageListener = listener;
				},
			},
		},
		tabs: {
			async query() {
				return [];
			},
		},
	};
	class FakeOffscreenCanvas {
		getContext() {
			return {
				arc() {},
				beginPath() {},
				drawImage() {},
				fill() {},
				fillStyle: "",
				getImageData() {
					return {};
				},
			};
		}
	}

	new Function(
		"chrome",
		"fetch",
		"createImageBitmap",
		"OffscreenCanvas",
		BACKGROUND_SOURCE,
	)(
		chrome,
		async () => ({ blob: async () => ({}) }),
		async () => ({}),
		FakeOffscreenCanvas,
	);

	return {
		async emitStorageChange(changes) {
			await storageListener(changes, "local");
		},
		titleUpdates,
	};
}

test("popup shows a load error when required browser data is unavailable", async () => {
	const visibleFailures = [];

	for (const failAt of ["tabs", "storage"]) {
		const { document } = createPopupHarness({ failAt });
		await document.start().catch(() => {});

		const errorMessage = document.elements.get("error-message");
		visibleFailures.push({
			appDisplay: document.elements.get("app-content").style.display,
			errorDisplay: errorMessage.style.display,
			errorText: errorMessage.textContent,
		});
	}

	expect(visibleFailures).toEqual([
		{
			appDisplay: "none",
			errorDisplay: "block",
			errorText: "Better Fab could not load. Close the popup and try again.",
		},
		{
			appDisplay: "none",
			errorDisplay: "block",
			errorText: "Better Fab could not load. Close the popup and try again.",
		},
	]);
});

test("popup restores active state when inactivation cannot be saved", async () => {
	const harness = createPopupHarness({
		storageData: { extensionActive: true, filterActive: true },
		setStorage: async (_value, writeNumber) => {
			if (writeNumber === 1) throw new Error("storage full");
		},
	});
	await harness.document.start();

	await harness.document.elements
		.get("disable-presets-btn")
		.dispatch("click")
		.catch(() => {});

	const toggleSaved = harness.document.elements.get("toggle-saved");
	toggleSaved.checked = false;
	await toggleSaved.dispatch("change");

	expect({
		errorDisplay: harness.document.elements.get("error-message").style.display,
		errorText: harness.document.elements.get("error-message").textContent,
		persistedActiveState: harness.storageWrites.at(-1).extensionActive,
		visibleState: harness.document.elements.get("extension-state").textContent,
	}).toEqual({
		errorDisplay: "block",
		errorText: "Could not save changes. Please try again.",
		persistedActiveState: true,
		visibleState: "Active",
	});
});

test("popup serializes overlapping writes before rolling back a failure", async () => {
	const firstWrite = createDeferred();
	const secondWrite = createDeferred();
	const harness = createPopupHarness({
		storageData: { extensionActive: true, filterActive: true },
		setStorage: async (_value, writeNumber) => {
			if (writeNumber === 1) return firstWrite.promise;
			if (writeNumber === 2) return secondWrite.promise;
		},
	});
	await harness.document.start();

	const toggleSaved = harness.document.elements.get("toggle-saved");
	toggleSaved.checked = false;
	const failedChange = toggleSaved.dispatch("change");
	await waitFor(() => harness.storageWrites.length === 1);

	const inactivate = harness.document.elements
		.get("disable-presets-btn")
		.dispatch("click");
	firstWrite.reject(new Error("storage full"));
	await failedChange;
	await waitFor(() => harness.storageWrites.length === 2);
	secondWrite.resolve();
	await inactivate;

	expect({
		persistedActiveState: harness.storageWrites[1].extensionActive,
		persistedFilterState: harness.storageWrites[1].filterActive,
		visibleActiveState:
			harness.document.elements.get("extension-state").textContent,
		visibleFilterState: toggleSaved.checked,
	}).toEqual({
		persistedActiveState: false,
		persistedFilterState: true,
		visibleActiveState: "Inactive",
		visibleFilterState: true,
	});
});

test("popup rolls repeated failed changes back to the persisted setting", async () => {
	const firstWrite = createDeferred();
	const secondWrite = createDeferred();
	const harness = createPopupHarness({
		storageData: { filterActive: true },
		setStorage: async (_value, writeNumber) => {
			if (writeNumber === 1) return firstWrite.promise;
			if (writeNumber === 2) return secondWrite.promise;
		},
	});
	await harness.document.start();

	const toggleSaved = harness.document.elements.get("toggle-saved");
	toggleSaved.checked = false;
	const firstChange = toggleSaved.dispatch("change");
	await waitFor(() => harness.storageWrites.length === 1);

	toggleSaved.checked = true;
	const secondChange = toggleSaved.dispatch("change");
	firstWrite.reject(new Error("storage full"));
	await firstChange;
	await waitFor(() => harness.storageWrites.length === 2);
	secondWrite.reject(new Error("storage still full"));
	await secondChange;

	const minReviews = harness.document.elements.get("min-reviews-input");
	minReviews.value = "1";
	await minReviews.dispatch("change");

	expect({
		persistedFilterState: harness.storageWrites[2].filterActive,
		visibleFilterState: toggleSaved.checked,
	}).toEqual({
		persistedFilterState: true,
		visibleFilterState: true,
	});
});

test("popup preserves a newer review threshold after an earlier write fails", async () => {
	const firstWrite = createDeferred();
	const secondWrite = createDeferred();
	const harness = createPopupHarness({
		storageData: { minimumReviewCount: 0 },
		setStorage: async (_value, writeNumber) => {
			if (writeNumber === 1) return firstWrite.promise;
			if (writeNumber === 2) return secondWrite.promise;
		},
	});
	await harness.document.start();

	const minReviews = harness.document.elements.get("min-reviews-input");
	minReviews.value = "1";
	const firstChange = minReviews.dispatch("change");
	await waitFor(() => harness.storageWrites.length === 1);

	minReviews.value = "2";
	const secondChange = minReviews.dispatch("change");
	firstWrite.reject(new Error("storage full"));
	await firstChange;
	await waitFor(() => harness.storageWrites.length === 2);
	secondWrite.resolve();
	await secondChange;

	expect({
		persistedValue: harness.storageWrites[1].minimumReviewCount,
		visibleValue: minReviews.value,
	}).toEqual({
		persistedValue: 2,
		visibleValue: "2",
	});
});

test("popup reports a broadcast failure after saving the setting", async () => {
	const harness = createPopupHarness({ failAt: "broadcast" });
	await harness.document.start();

	const toggleSaved = harness.document.elements.get("toggle-saved");
	toggleSaved.checked = false;
	await toggleSaved.dispatch("change").catch(() => {});

	expect({
		errorText: harness.document.elements.get("error-message").textContent,
		persistedValue: harness.storageWrites.at(-1).filterActive,
		visibleValue: toggleSaved.checked,
	}).toEqual({
		errorText:
			"Changes were saved, but open Fab tabs could not be updated. Refresh them and try again.",
		persistedValue: false,
		visibleValue: false,
	});
});

test("popup reports a content-script broadcast rejection after saving", async () => {
	const harness = createPopupHarness({
		sendMessage: async () => {
			throw new Error("receiving end does not exist");
		},
	});
	const originalQuery = harness.chrome.tabs.query;
	harness.chrome.tabs.query = async (query) =>
		query.active
			? originalQuery(query)
			: [{ id: 8, url: "https://www.fab.com/channels/assets" }];
	await harness.document.start();

	const toggleSaved = harness.document.elements.get("toggle-saved");
	toggleSaved.checked = false;
	await toggleSaved.dispatch("change");

	expect({
		errorText: harness.document.elements.get("error-message").textContent,
		persistedValue: harness.storageWrites.at(-1).filterActive,
	}).toEqual({
		errorText:
			"Changes were saved, but open Fab tabs could not be updated. Refresh them and try again.",
		persistedValue: false,
	});
});

test("popup restores checkbox settings when persistence fails", async () => {
	const cases = [
		["toggle-saved", "filterActive", false, true],
		[
			"toggle-saved-seller-page",
			"applySavedFilterOnSellerPage",
			false,
			true,
		],
		["toggle-hide-seller-buttons", "showHideSellerButtons", false, true],
		["toggle-library-seller", "applySellerFilterInLibrary", true, false],
		["toggle-star-review-sort", "sortStarsByReviewCount", true, false],
	];
	const results = [];

	for (const [elementId, storageKey, attemptedValue, savedValue] of cases) {
		const harness = createPopupHarness({
			setStorage: async (_value, writeNumber) => {
				if (writeNumber === 1) throw new Error("storage full");
			},
		});
		await harness.document.start();

		const toggle = harness.document.elements.get(elementId);
		toggle.checked = attemptedValue;
		await toggle.dispatch("change").catch(() => {});

		const minReviews = harness.document.elements.get("min-reviews-input");
		minReviews.value = "1";
		await minReviews.dispatch("change");

		results.push({
			errorText: harness.document.elements.get("error-message").textContent,
			persistedValue: harness.storageWrites.at(-1)[storageKey],
			toggleValue: toggle.checked,
			expectedValue: savedValue,
		});
	}

	expect(results).toEqual(
		cases.map(([, , , savedValue]) => ({
			errorText: "Could not save changes. Please try again.",
			persistedValue: savedValue,
			toggleValue: savedValue,
			expectedValue: savedValue,
		})),
	);
});

test("popup restores the review threshold when persistence fails", async () => {
	const harness = createPopupHarness({
		storageData: { minimumReviewCount: 3 },
		setStorage: async (_value, writeNumber) => {
			if (writeNumber === 1) throw new Error("storage full");
		},
	});
	await harness.document.start();

	const minReviews = harness.document.elements.get("min-reviews-input");
	minReviews.value = "9";
	await minReviews.dispatch("change").catch(() => {});

	const toggleSaved = harness.document.elements.get("toggle-saved");
	toggleSaved.checked = false;
	await toggleSaved.dispatch("change");

	expect({
		errorText: harness.document.elements.get("error-message").textContent,
		inputValue: minReviews.value,
		persistedValue: harness.storageWrites.at(-1).minimumReviewCount,
	}).toEqual({
		errorText: "Could not save changes. Please try again.",
		inputValue: "3",
		persistedValue: 3,
	});
});

test("popup restores list additions when persistence fails", async () => {
	const cases = [
		{
			buttonId: "add-seller-btn",
			inputId: "seller-input",
			storageData: { hiddenSellers: ["kept seller"] },
			storageKey: "hiddenSellers",
		},
		{
			buttonId: "add-keyword-btn",
			inputId: "keyword-input",
			storageData: { hiddenKeywords: ["kept keyword"] },
			storageKey: "hiddenKeywords",
		},
	];
	const results = [];

	for (const testCase of cases) {
		const harness = createPopupHarness({
			storageData: testCase.storageData,
			setStorage: async (_value, writeNumber) => {
				if (writeNumber === 1) throw new Error("storage full");
			},
		});
		await harness.document.start();

		const input = harness.document.elements.get(testCase.inputId);
		input.value = "new value";
		await harness.document.elements
			.get(testCase.buttonId)
			.dispatch("click")
			.catch(() => {});

		const minReviews = harness.document.elements.get("min-reviews-input");
		minReviews.value = "1";
		await minReviews.dispatch("change");

		results.push({
			errorText: harness.document.elements.get("error-message").textContent,
			inputValue: input.value,
			persistedValues: harness.storageWrites.at(-1)[testCase.storageKey],
		});
	}

	expect(results).toEqual([
		{
			errorText: "Could not save changes. Please try again.",
			inputValue: "new value",
			persistedValues: ["kept seller"],
		},
		{
			errorText: "Could not save changes. Please try again.",
			inputValue: "new value",
			persistedValues: ["kept keyword"],
		},
	]);
});

test("popup restores list removals when persistence fails", async () => {
	const cases = [
		{
			listId: "seller-list",
			storageData: { hiddenSellers: ["kept seller"] },
			storageKey: "hiddenSellers",
		},
		{
			listId: "keyword-list",
			storageData: { hiddenKeywords: ["kept keyword"] },
			storageKey: "hiddenKeywords",
		},
	];
	const results = [];

	for (const testCase of cases) {
		const harness = createPopupHarness({
			storageData: testCase.storageData,
			setStorage: async (_value, writeNumber) => {
				if (writeNumber === 1) throw new Error("storage full");
			},
		});
		await harness.document.start();

		const list = harness.document.elements.get(testCase.listId);
		const removeButton = list.children[0].children[0];
		await removeButton.dispatch("click").catch(() => {});

		const minReviews = harness.document.elements.get("min-reviews-input");
		minReviews.value = "1";
		await minReviews.dispatch("change");

		results.push({
			errorText: harness.document.elements.get("error-message").textContent,
			persistedValues: harness.storageWrites.at(-1)[testCase.storageKey],
			visibleItems: list.children.map((item) => item.textContent),
		});
	}

	expect(results).toEqual([
		{
			errorText: "Could not save changes. Please try again.",
			persistedValues: ["kept seller"],
			visibleItems: ["kept seller"],
		},
		{
			errorText: "Could not save changes. Please try again.",
			persistedValues: ["kept keyword"],
			visibleItems: ["kept keyword"],
		},
	]);
});

test("popup restores filter presets when persistence fails", async () => {
	const harness = createPopupHarness({
		setStorage: async (_value, writeNumber) => {
			if (writeNumber === 1) throw new Error("storage full");
		},
	});
	await harness.document.start();

	const presetList = harness.document.elements.get("preset-list");
	const noAiCheckbox = presetList.children[0].children[1];
	noAiCheckbox.checked = true;
	await noAiCheckbox.dispatch("change").catch(() => {});

	const minReviews = harness.document.elements.get("min-reviews-input");
	minReviews.value = "1";
	await minReviews.dispatch("change");

	expect({
		checkboxValue: presetList.children[0].children[1].checked,
		errorText: harness.document.elements.get("error-message").textContent,
		persistedValue:
			harness.storageWrites.at(-1).activeFilterPresets["no-ai"],
	}).toEqual({
		checkboxValue: false,
		errorText: "Could not save changes. Please try again.",
		persistedValue: false,
	});
});

test("popup restores imported lists when persistence fails", async () => {
	const cases = [
		{
			inputId: "seller-import-file",
			storageData: { hiddenSellers: ["kept seller"] },
			storageKey: "hiddenSellers",
		},
		{
			inputId: "keyword-import-file",
			storageData: { hiddenKeywords: ["kept keyword"] },
			storageKey: "hiddenKeywords",
		},
	];
	const results = [];

	for (const testCase of cases) {
		const harness = createPopupHarness({
			storageData: testCase.storageData,
			setStorage: async (_value, writeNumber) => {
				if (writeNumber === 1) throw new Error("storage full");
			},
		});
		await harness.document.start();

		const importInput = harness.document.elements.get(testCase.inputId);
		importInput.files = [{ contents: "new value\n" }];
		await importInput.dispatch("change");
		await waitFor(
			() =>
				harness.document.elements.get("error-message").textContent ===
				"Could not save changes. Please try again.",
		);

		const minReviews = harness.document.elements.get("min-reviews-input");
		minReviews.value = "1";
		await minReviews.dispatch("change");

		results.push({
			errorText: harness.document.elements.get("error-message").textContent,
			persistedValues: harness.storageWrites.at(-1)[testCase.storageKey],
		});
	}

	expect(results).toEqual([
		{
			errorText: "Could not save changes. Please try again.",
			persistedValues: ["kept seller"],
		},
		{
			errorText: "Could not save changes. Please try again.",
			persistedValues: ["kept keyword"],
		},
	]);
});

test("popup keeps Activate disabled after Inactivate while Mass-Add is pending", async () => {
	const massAdd = createDeferred();
	const harness = createPopupHarness({
		storageData: { extensionActive: true },
		sendMessage: async (_tabId, message) => {
			if (message.action === "add_free_library") return massAdd.promise;
		},
	});
	await harness.document.start();

	const addButton = harness.document.elements.get("add-free-library-btn");
	await addButton.dispatch("click");
	await waitFor(() =>
		harness.sentMessages.some(
			({ message }) => message.action === "add_free_library",
		),
	);
	await harness.document.elements.get("disable-presets-btn").dispatch("click");

	const busyState = {
		activateDisabled:
			harness.document.elements.get("apply-presets-btn").disabled,
		extensionState:
			harness.document.elements.get("extension-state").textContent,
	};
	massAdd.resolve({ ok: true });
	await waitFor(() => addButton.disabled === false);

	expect(busyState).toEqual({
		activateDisabled: true,
		extensionState: "Inactive",
	});
});

test("popup reports an already-running Mass-Add response as a failure", async () => {
	const harness = createPopupHarness({
		sendMessage: async () => ({ ok: true, error: "Already running" }),
	});
	await harness.document.start();

	const addButton = harness.document.elements.get("add-free-library-btn");
	await addButton.dispatch("click");
	await waitFor(() => harness.sentMessages.length === 1);
	await Bun.sleep(0);

	expect({
		buttonDisabled: addButton.disabled,
		buttonLabel: addButton.textContent,
		errorText: harness.document.elements.get("error-message").textContent,
	}).toEqual({
		buttonDisabled: false,
		buttonLabel: "Add Displaying Free Items",
		errorText: "Unable to add items: Already running",
	});
});

test("background keeps the latest toolbar state when startup resolves late", async () => {
	const storageRead = createDeferred();
	const harness = createBackgroundHarness(storageRead);

	await harness.emitStorageChange({
		extensionActive: { newValue: false, oldValue: true },
	});
	storageRead.resolve({ extensionActive: true, filterActive: true });
	await Bun.sleep(0);
	await Bun.sleep(0);

	expect(harness.titleUpdates.at(-1)).toEqual({
		title: "Better Fab: Inactive",
	});
});

test("popup and background share the legacy filterActive fallback", async () => {
	const popupHarness = createPopupHarness({
		storageData: { filterActive: false },
	});
	await popupHarness.document.start();

	const storageRead = createDeferred();
	const backgroundHarness = createBackgroundHarness(storageRead);
	storageRead.resolve({ filterActive: false });
	await waitFor(() => backgroundHarness.titleUpdates.length === 1);

	expect({
		backgroundTitle: backgroundHarness.titleUpdates[0].title,
		popupState: popupHarness.document.elements.get("extension-state").textContent,
	}).toEqual({
		backgroundTitle: "Better Fab: Inactive",
		popupState: "Inactive",
	});
});
