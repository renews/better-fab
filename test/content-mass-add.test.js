import { expect, test } from "bun:test";

class FakeElement {
	constructor({ ariaLabel = "", href = "", text = "", tagName = "DIV" } = {}) {
		this.ariaLabel = ariaLabel;
		this.href = href;
		this.innerText = text;
		this.textContent = text;
		this.tagName = tagName;
		this.localName = tagName.toLowerCase();
		this.title = "";
		this.disabled = false;
		this.offsetParent = {};
		this.parentElement = null;
		this.children = [];
		this.isConnected = true;
		this.clickCount = 0;
		this.onClick = null;
		const classes = new Set();
		this.classList = {
			add(value) {
				classes.add(value);
			},
			remove(value) {
				classes.delete(value);
			},
			contains(value) {
				return classes.has(value);
			},
		};
	}

	getAttribute(name) {
		if (name === "href") return this.href;
		if (name === "aria-label") return this.ariaLabel;
		return null;
	}

	getElementsByTagName(name) {
		if (name !== "a") return [];
		return this.children.filter((child) => child.tagName === "A");
	}

	getElementsByClassName() {
		return [];
	}

	querySelector(selector) {
		if (selector.includes('a[href*="/products/"]')) {
			return this.children.find((child) => child.tagName === "A") || null;
		}
		return null;
	}

	querySelectorAll(selector) {
		if (selector.startsWith("button,")) {
			return this.children.filter((child) =>
				["A", "BUTTON"].includes(child.tagName),
			);
		}
		return [];
	}

	closest(selector) {
		if (
			this.tagName === "ARTICLE" &&
			selector.includes("article")
		) {
			return this;
		}
		return null;
	}

	contains(node) {
		return node === this || this.children.includes(node);
	}

	getBoundingClientRect() {
		return { left: 0, top: 0, right: 200, bottom: 120, width: 200, height: 120 };
	}

	focus() {}
	dispatchEvent() {}
	scrollIntoView() {}
	click() {
		this.clickCount += 1;
		this.onClick?.();
	}
}

function createContentRuntime(cardText, actionText, settings = {}) {
	let remainingStorageFailures = Number(settings.__storageFailures || 0);
	const storedSettings = { ...settings };
	delete storedSettings.__storageFailures;
	const action = new FakeElement({ text: actionText, tagName: "BUTTON" });
	const link = new FakeElement({ href: "/listings/paid-item", tagName: "A" });
	const card = new FakeElement({ text: cardText, tagName: "ARTICLE" });
	card.children = [link, action];
	link.parentElement = card;
	action.parentElement = card;

	const otherLink = new FakeElement({ href: "/listings/other-item", tagName: "A" });
	const otherCard = new FakeElement({ text: "Other item", tagName: "ARTICLE" });
	otherCard.children = [otherLink];
	otherLink.parentElement = otherCard;

	const grid = new FakeElement({ tagName: "SECTION" });
	grid.children = [card, otherCard];
	card.parentElement = grid;
	otherCard.parentElement = grid;

	const document = {
		body: {
			scrollHeight: 1000,
			contains() {
				return true;
			},
		},
		getElementsByTagName(name) {
			return name === "a" ? [link] : [];
		},
		getElementsByClassName() {
			return [];
		},
		querySelector() {
			return null;
		},
		querySelectorAll() {
			return [];
		},
		elementFromPoint() {
			return card;
		},
	};

	let messageListener = null;
	const chrome = {
		storage: {
			local: {
				async get() {
					if (remainingStorageFailures > 0) {
						remainingStorageFailures -= 1;
						throw new Error("storage unavailable");
					}
					return {
						extensionActive: true,
						filterActive: false,
						showHideSellerButtons: false,
						...storedSettings,
					};
				},
				async set() {},
			},
			onChanged: { addListener() {} },
		},
		runtime: {
			onMessage: {
				addListener(listener) {
					messageListener = listener;
				},
			},
		},
	};

	let scrollCount = 0;
	const window = {
		location: {
			pathname: "/search",
			search: "",
			origin: "https://www.fab.com",
		},
		scrollTo() {
			scrollCount += 1;
		},
		dispatchEvent() {},
	};

	let now = 0;
	class FastDate extends Date {
		static now() {
			now += 1000;
			return now;
		}
	}

	class FakeMutationObserver {
		observe() {}
	}

	class FakeEvent {
		constructor(type) {
			this.type = type;
		}
	}

	return {
		action,
		card,
		link,
		get scrollCount() {
			return scrollCount;
		},
		async load() {
			const source = [
				await Bun.file("modules/fab-dom-adapter.js").text(),
				await Bun.file("modules/seller-profile.js").text(),
				await Bun.file("modules/mass-add.js").text(),
				await Bun.file("modules/processing-coordinator.js").text(),
				await Bun.file("content.js").text(),
			].join("\n");
			const evaluate = new Function(
				"globalThis",
				"chrome",
				"document",
				"window",
				"MutationObserver",
				"Element",
				"Node",
				"DOMParser",
				"MouseEvent",
				"KeyboardEvent",
				"Date",
				"console",
				"alert",
				"setTimeout",
				`${source}\nreturn true;`,
			);
			evaluate(
				window,
				chrome,
				document,
				window,
				FakeMutationObserver,
				FakeElement,
				{ DOCUMENT_POSITION_FOLLOWING: 4 },
				class {},
				FakeEvent,
				FakeEvent,
				FastDate,
				{ error() {}, log() {}, warn() {} },
				() => {},
				(callback) => {
					callback();
					return 1;
				},
			);
			for (let index = 0; index < 5; index += 1) {
				await Promise.resolve();
			}
		},
		async addFreeItems() {
			return await new Promise((resolve) => {
				messageListener({ action: "add_free_library" }, null, resolve);
			});
		},
		deactivate() {
			messageListener(
				{ action: "update_state", extensionActive: false },
				null,
				() => {},
			);
		},
		replaceActionAfterClick({ ariaLabel = "", text = "" } = {}) {
			action.onClick = () => {
				const replacement = new FakeElement({
					ariaLabel,
					tagName: "BUTTON",
					text,
				});
				replacement.parentElement = card;
				card.children = [link, replacement];
			};
		},
	};
}

test("Mass-Add ignores a paid card with zero reviews and an Add to cart action", async () => {
	const runtime = createContentRuntime("Premium Asset $49.99 · 0 reviews", "Add to cart");
	await runtime.load();

	const result = await runtime.addFreeItems();

	expect(runtime.action.clickCount).toBe(0);
	expect(result).toMatchObject({ ok: true, attempted: 0, added: 0 });
});

test("Mass-Add never treats Add to cart as a library action", async () => {
	const runtime = createContentRuntime("Free promotional asset", "Add to cart");
	await runtime.load();

	const result = await runtime.addFreeItems();

	expect(runtime.action.clickCount).toBe(0);
	expect(result).toMatchObject({
		ok: true,
		attempted: 1,
		added: 0,
		noActionButton: 1,
	});
});

test("Mass-Add skips alternate detail links that contain library action text", async () => {
	const runtime = createContentRuntime(
		"Free promotional asset",
		"Add to library",
	);
	runtime.link.href = "/models/free-pack";
	runtime.link.textContent = "Free pack Add to library";
	runtime.link.innerText = "Free pack Add to library";
	runtime.replaceActionAfterClick({ ariaLabel: "In library" });
	await runtime.load();

	const result = await runtime.addFreeItems();

	expect({
		actionClickCount: runtime.action.clickCount,
		listingClickCount: runtime.link.clickCount,
		result,
	}).toMatchObject({
		actionClickCount: 1,
		listingClickCount: 0,
		result: { added: 1, attempted: 1 },
	});
});

test("Mass-Add reports a second request as busy instead of successful", async () => {
	const runtime = createContentRuntime("Premium Asset $49.99", "Add to cart");
	await runtime.load();

	const activeRun = runtime.addFreeItems();
	const busyResult = await runtime.addFreeItems();
	await activeRun;

	expect(busyResult).toEqual({ ok: false, error: "Already running" });
});

test("deactivating Better Fab stops an active Mass-Add run", async () => {
	const runtime = createContentRuntime("Free promotional asset", "Add to library");
	await runtime.load();

	const activeRun = runtime.addFreeItems();
	runtime.deactivate();
	const result = await activeRun;

	expect({
		attempted: result.attempted,
		clickCount: runtime.action.clickCount,
		scrollCount: runtime.scrollCount,
	}).toEqual({
		attempted: 0,
		clickCount: 0,
		scrollCount: 0,
	});
});

test("Mass-Add does not report an unchanged card as added", async () => {
	const runtime = createContentRuntime("Free promotional asset", "Add to library");
	await runtime.load();

	const result = await runtime.addFreeItems();

	expect(runtime.action.clickCount).toBe(1);
	expect(result).toMatchObject({ ok: true, added: 0, skipped: 1 });
});

test("Mass-Add does not treat unrelated Add to cart text as confirmation", async () => {
	const runtime = createContentRuntime(
		"Free promotional asset with Add to cart option",
		"Add to library",
	);
	await runtime.load();

	const result = await runtime.addFreeItems();

	expect({
		added: result.added,
		clickCount: runtime.action.clickCount,
		skipped: result.skipped,
	}).toEqual({
		added: 0,
		clickCount: 1,
		skipped: 1,
	});
});

test("Mass-Add does not confirm from an owned word in product copy", async () => {
	const runtime = createContentRuntime(
		"Free character pack by Owned Studios",
		"Add to library",
	);
	await runtime.load();

	const result = await runtime.addFreeItems();

	expect(result).toMatchObject({ added: 0, skipped: 1 });
});

test("Mass-Add ignores an owned word in the product link", async () => {
	const runtime = createContentRuntime("Free character pack", "Add to library");
	runtime.link.textContent = "Owned Character Pack";
	runtime.link.innerText = "Owned Character Pack";
	await runtime.load();

	const result = await runtime.addFreeItems();

	expect({
		added: result.added,
		alreadyInLibrary: result.alreadyInLibrary,
		clickCount: runtime.action.clickCount,
	}).toEqual({ added: 0, alreadyInLibrary: 0, clickCount: 1 });
});

test("Mass-Add confirms a replacement control by its aria label", async () => {
	const runtime = createContentRuntime("Free character pack", "Add to library");
	runtime.replaceActionAfterClick({ ariaLabel: "In library" });
	await runtime.load();

	const result = await runtime.addFreeItems();

	expect(result).toMatchObject({ added: 1, skipped: 0 });
});

test("Mass-Add classifies an existing library control before action lookup", async () => {
	const runtime = createContentRuntime("Free character pack", "In library");
	await runtime.load();

	const result = await runtime.addFreeItems();

	expect(result).toMatchObject({
		alreadyInLibrary: 1,
		attempted: 1,
		noActionButton: 0,
	});
});

test("a dot-grouped review count satisfies the configured minimum", async () => {
	const runtime = createContentRuntime(
		"Premium Asset 4.8 (1.234)",
		"Add to library",
		{ minimumReviewCount: 1000 },
	);

	await runtime.load();

	expect(runtime.card.classList.contains("fab-hidden-item")).toBe(false);
});

test("a legacy inactive profile keeps content automation inactive", async () => {
	const runtime = createContentRuntime(
		"Premium Asset $49.99",
		"Add to cart",
		{ extensionActive: undefined, filterActive: false },
	);
	await runtime.load();

	await runtime.addFreeItems();

	expect(runtime.scrollCount).toBe(0);
});

test("a transient storage failure retries and applies the stored content settings", async () => {
	const runtime = createContentRuntime(
		"Saved in my library",
		"In library",
		{
			__storageFailures: 1,
			extensionActive: true,
			filterActive: true,
			showHideSellerButtons: false,
		},
	);

	await runtime.load();

	expect(runtime.card.classList.contains("fab-hidden-item")).toBe(true);
});
