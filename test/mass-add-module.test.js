import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";

const massAddSource = await Bun.file(
	new URL("../modules/mass-add.js", import.meta.url),
).text();

function deferred() {
	let resolve;
	const promise = new Promise((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

function createSession({ wait = async () => {} } = {}) {
	const moduleGlobal = {
		BetterFabModules: {
			fabDom: {
				isMarketplaceNavigationLink: () => false,
			},
		},
	};
	new Function("globalThis", massAddSource)(moduleGlobal);
	const notifications = [];
	const source = {
		getCard() {
			return null;
		},
		getListingNodes() {
			return [];
		},
	};
	const document = {
		body: { scrollHeight: 0 },
		querySelector() {
			return null;
		},
		querySelectorAll() {
			return [];
		},
	};
	const window = { scrollTo() {} };

	return {
		notifications,
		session: moduleGlobal.BetterFabModules.massAdd.create({
			document,
			getCardMetrics: () => ({}),
			getSource: () => source,
			hasSavedItemMarker: () => false,
			isActive: () => true,
			notify: (message) => notifications.push(message),
			wait,
			window,
		}),
	};
}

function createPaidLicenseSession({ closeWithEscape = false } = {}) {
	const dom = new JSDOM(`<!doctype html>
		<body>
			<section>
				<article id="card">
					<a href="/products/free-pack">Free pack</a>
					<button id="add">Add to library</button>
				</article>
			</section>
		</body>`, { url: "https://www.fab.com/search" });
	const { document, window } = dom.window;
	const card = document.getElementById("card");
	const action = document.getElementById("add");
	const listingLink = card.querySelector("a");
	const bounds = {
		bottom: 120,
		height: 120,
		left: 0,
		right: 200,
		top: 0,
		width: 200,
	};
	card.getBoundingClientRect = () => bounds;
	action.getBoundingClientRect = () => bounds;
	action.scrollIntoView = () => {};
	document.elementFromPoint = () => card;
	window.scrollTo = () => {};

	let closeCount = 0;
	let modalAddCount = 0;
	let escapeCount = 0;
	let actionClickCount = 0;
	action.addEventListener("click", () => {
		actionClickCount += 1;
		const modal = document.createElement("div");
		modal.setAttribute("role", "dialog");
		modal.setAttribute("aria-modal", "true");
		modal.getBoundingClientRect = () => bounds;
		modal.innerHTML = `
			<h2 class="fabkit-Modal-title">Choose license tier</h2>
			<div class="fabkit-FormField-root">
				<label>Professional license $49.99</label>
			</div>
			<div class="fabkit-Modal-actions"><button>Add</button></div>
		`;
		modal.querySelector(".fabkit-Modal-actions button").addEventListener(
			"click",
			() => {
				modalAddCount += 1;
			},
		);
		if (!closeWithEscape) {
			const close = document.createElement("button");
			close.className = "fabkit-Modal-closeButton";
			close.addEventListener("click", () => {
				closeCount += 1;
				modal.remove();
			});
			modal.appendChild(close);
		}
		document.body.appendChild(modal);
	});
	window.addEventListener("keydown", (event) => {
		if (event.key !== "Escape") return;
		escapeCount += 1;
		document.querySelector('[role="dialog"]')?.remove();
	});

	const moduleGlobal = {
		BetterFabModules: {
			fabDom: { isMarketplaceNavigationLink: () => false },
		},
	};
	new Function("globalThis", massAddSource)(moduleGlobal);
	const source = {
		getCard: () => card,
		getListingNodes: () => [listingLink],
	};
	const session = moduleGlobal.BetterFabModules.massAdd.create({
		document,
		getCardMetrics: () => ({ searchText: "Free pack" }),
		getSource: () => source,
		hasSavedItemMarker: () => false,
		isActive: () => true,
		notify() {},
		wait: async () => {},
		window,
	});

	return {
		action,
		get actionClickCount() {
			return actionClickCount;
		},
		get closeCount() {
			return closeCount;
		},
		get escapeCount() {
			return escapeCount;
		},
		get modalAddCount() {
			return modalAddCount;
		},
		get modalPresent() {
			return Boolean(document.querySelector('[role="dialog"]'));
		},
		session,
	};
}

test("Mass-Add exposes one session interface and an outcome contract", async () => {
	const { notifications, session } = createSession();

	const result = await session.run();

	expect({
		isRunning: session.isRunning(),
		notificationCount: notifications.length,
		result,
	}).toEqual({
		isRunning: false,
		notificationCount: 1,
		result: {
			added: 0,
			alreadyInLibrary: 0,
			attempted: 0,
			noActionButton: 0,
			skipped: 0,
		},
	});
});

test("Mass-Add session owns its busy state", async () => {
	const firstWait = deferred();
	let waitCount = 0;
	const { session } = createSession({
		wait: async () => {
			waitCount += 1;
			if (waitCount === 1) await firstWait.promise;
		},
	});

	const activeRun = session.run();
	await Promise.resolve();
	const busyResult = await session.run();
	firstWait.resolve();
	await activeRun;

	expect(busyResult).toEqual({ error: "Already running" });
});

test("Mass-Add rejects a paid-only license modal and closes it", async () => {
	const runtime = createPaidLicenseSession();

	const result = await runtime.session.run();

	expect({
		actionClickCount: runtime.actionClickCount,
		closeCount: runtime.closeCount,
		modalAddCount: runtime.modalAddCount,
		modalPresent: runtime.modalPresent,
		result,
	}).toMatchObject({
		actionClickCount: 1,
		closeCount: 1,
		modalAddCount: 0,
		modalPresent: false,
		result: { added: 0, attempted: 1, skipped: 1 },
	});
});

test("Mass-Add falls back to Escape when a paid modal has no close control", async () => {
	const runtime = createPaidLicenseSession({ closeWithEscape: true });

	const result = await runtime.session.run();

	expect({
		actionClickCount: runtime.actionClickCount,
		escapeCount: runtime.escapeCount,
		modalAddCount: runtime.modalAddCount,
		modalPresent: runtime.modalPresent,
		result,
	}).toMatchObject({
		actionClickCount: 1,
		escapeCount: 1,
		modalAddCount: 0,
		modalPresent: false,
		result: { added: 0, attempted: 1, skipped: 1 },
	});
});

test("Mass-Add keeps a nested library action on the current listing page", async () => {
	const dom = new JSDOM(`<!doctype html>
		<body>
			<section>
				<article id="card">
					<a id="product" href="/products/free-pack">
						<span>Free pack</span>
						<button id="add">Add to library</button>
					</a>
				</article>
			</section>
		</body>`, { url: "https://www.fab.com/search" });
	const { document, window } = dom.window;
	const card = document.getElementById("card");
	const action = document.getElementById("add");
	const productLink = document.getElementById("product");
	const bounds = {
		bottom: 120,
		height: 120,
		left: 0,
		right: 200,
		top: 0,
		width: 200,
	};
	card.getBoundingClientRect = () => bounds;
	action.getBoundingClientRect = () => bounds;
	action.scrollIntoView = () => {};
	document.elementFromPoint = () => card;
	window.scrollTo = () => {};

	let actionClickCount = 0;
	let navigationDefaultPrevented = null;
	action.addEventListener("click", () => {
		actionClickCount += 1;
		const modal = document.createElement("div");
		modal.setAttribute("role", "dialog");
		modal.setAttribute("aria-modal", "true");
		modal.getBoundingClientRect = () => bounds;
		modal.innerHTML = `
			<h2 class="fabkit-Modal-title">Choose license tier</h2>
			<div class="fabkit-FormField-root">
				<label>Personal license Free</label>
			</div>
			<div class="fabkit-Modal-actions"><button>Add</button></div>
		`;
		modal.querySelector(".fabkit-Modal-actions button").addEventListener(
			"click",
			() => {
				action.setAttribute("aria-label", "In library");
				modal.remove();
			},
		);
		document.body.appendChild(modal);
	});
	productLink.addEventListener("click", (event) => {
		navigationDefaultPrevented = event.defaultPrevented;
	});

	const moduleGlobal = {
		BetterFabModules: {
			fabDom: {
				isMarketplaceNavigationLink: (element) =>
					element?.tagName === "A" &&
					/\/(?:products|listings)\//.test(element.getAttribute("href") || ""),
			},
		},
	};
	new Function("globalThis", massAddSource)(moduleGlobal);
	const session = moduleGlobal.BetterFabModules.massAdd.create({
		document,
		getCardMetrics: () => ({ searchText: "Free pack" }),
		getSource: () => ({
			getCard: () => card,
			getListingNodes: () => [productLink],
		}),
		hasSavedItemMarker: () => false,
		isActive: () => true,
		notify() {},
		wait: async () => {},
		window,
	});

	const result = await session.run();

	expect({ actionClickCount, navigationDefaultPrevented, result }).toMatchObject({
		actionClickCount: 1,
		navigationDefaultPrevented: true,
		result: { added: 1, attempted: 1 },
	});
});

test("extension loads Mass-Add before the content adapter", async () => {
	const manifest = await Bun.file(
		new URL("../manifest.json", import.meta.url),
	).json();

	const scripts = manifest.content_scripts[0].js;
	expect(scripts.indexOf("modules/mass-add.js")).toBeLessThan(
		scripts.indexOf("content.js"),
	);
});
