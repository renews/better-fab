import { afterEach, expect, test } from "bun:test";
import { JSDOM } from "jsdom";

const contentScript = [
	await Bun.file(
		new URL("../modules/fab-dom-adapter.js", import.meta.url),
	).text(),
	await Bun.file(
		new URL("../modules/seller-profile.js", import.meta.url),
	).text(),
	await Bun.file(new URL("../modules/mass-add.js", import.meta.url)).text(),
	await Bun.file(
		new URL("../modules/processing-coordinator.js", import.meta.url),
	).text(),
	await Bun.file(new URL("../content.js", import.meta.url)).text(),
].join("\n");

const openDoms = [];

afterEach(() => {
	for (const dom of openDoms.splice(0)) dom.window.close();
});

async function flushExtensionWork() {
	await Promise.resolve();
	await Promise.resolve();
}

function deferred() {
	let resolve;
	const promise = new Promise((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

function sellerMetricsResponse({ rating, reviews, slug }) {
	return {
		ok: true,
		text: async () => `<!doctype html>
			<body>
				<h1>${slug}</h1>
				<article>
					<a href="/products/${slug}-asset">${slug} asset</a>
					<span>${rating} (${reviews})</span>
				</article>
			</body>`,
	};
}

async function loadProductPage({
	fetchSeller,
	html = `<!doctype html>
		<body>
			<main>
				<div class="fabkit-Stack-root"><h1>Example product</h1></div>
				<a href="/sellers/acme">Acme</a>
			</main>
		</body>`,
	url = "https://www.fab.com/products/example-product",
}) {
	const dom = new JSDOM(
		html,
		{
			runScripts: "outside-only",
			url,
		},
	);
	openDoms.push(dom);

	let mutationListener = null;
	let storageChangeListener = null;
	const { window } = dom;
	window.fetch = fetchSeller;
	window.console.error = () => {};
	window.MutationObserver = class {
		constructor(listener) {
			mutationListener = listener;
		}

		observe() {}
	};
	window.setTimeout = (callback, delay) => {
		if (delay === 175) queueMicrotask(callback);
		return 1;
	};
	window.clearTimeout = () => {};
	window.chrome = {
		runtime: {
			onMessage: {
				addListener() {},
			},
		},
		storage: {
			local: {
				get: async () => ({
					extensionActive: true,
					hiddenSellers: [],
				}),
				set: async () => {},
			},
			onChanged: {
				addListener(listener) {
					storageChangeListener = listener;
				},
			},
		},
	};

	window.eval(contentScript);
	await flushExtensionWork();

	return {
		document: window.document,
		mutateProductPage(element) {
			mutationListener([
				{
					addedNodes: [element],
					removedNodes: [],
					target: window.document.querySelector("main"),
				},
			]);
		},
		updateStorage(changes) {
			storageChangeListener(changes, "local");
		},
		window,
	};
}

test("product seller metrics retry after a non-OK response", async () => {
	let requestCount = 0;
	await loadProductPage({
		fetchSeller: async () => {
			requestCount += 1;
			return requestCount === 1
				? { ok: false }
				: sellerMetricsResponse({ rating: "4.0", reviews: 10, slug: "acme" });
		},
	});
	await flushExtensionWork();

	expect(requestCount).toBe(2);
});

test("product seller metrics retry after a failed request", async () => {
	let requestCount = 0;
	const page = await loadProductPage({
		fetchSeller: async () => {
			requestCount += 1;
			if (requestCount === 1) throw new Error("network unavailable");
			return sellerMetricsResponse({ rating: "4.0", reviews: 10, slug: "acme" });
		},
	});
	await flushExtensionWork();

	expect(requestCount).toBe(2);
});

test("product seller metrics count each fetched package once", async () => {
	const page = await loadProductPage({
		fetchSeller: async () => ({
			ok: true,
			text: async () => `<!doctype html>
				<body>
					<h1>Acme</h1>
					<section>
						<article>
							<a href="/products/acme-asset">Acme image</a>
							<a href="/products/acme-asset">Acme title</a>
							<span>4.0 (7)</span>
						</article>
					</section>
				</body>`,
		}),
	});
	await flushExtensionWork();

	expect(
		page.document.querySelector(
			"#better-fab-product-profile .better-fab-seller-profile-count",
		)?.textContent,
	).toBe("7 reviews across 1 package");
});

test("product seller metrics exclude packages linked to another seller", async () => {
	const page = await loadProductPage({
		fetchSeller: async () => ({
			ok: true,
			text: async () => `<!doctype html>
				<body>
					<h1>Acme</h1>
					<section>
						<article>
							<a href="/products/acme-asset">Acme asset</a>
							<span>4.0 (7)</span>
						</article>
					</section>
					<section>
						<article>
							<a href="/products/bravo-asset">Bravo asset</a>
							<a href="https://www.fab.com/sellers/bravo">Bravo</a>
							<span>5.0 (100)</span>
						</article>
					</section>
				</body>`,
		}),
	});
	await flushExtensionWork();

	expect(
		page.document.querySelector(
			"#better-fab-product-profile .better-fab-seller-profile-count",
		)?.textContent,
	).toBe("7 reviews across 1 package");
});

test("seller metrics match a seller slug to its visible name", async () => {
	const page = await loadProductPage({
		fetchSeller: async () => ({ ok: false }),
		html: `<!doctype html>
			<body>
				<main>
					<h1>Acme Studio</h1>
					<section>
						<article>
							<a href="/products/acme-asset">Acme asset</a>
							<a href="/sellers/acme-studio">Acme Studio</a>
							<span>4.0 (7)</span>
						</article>
					</section>
				</main>
			</body>`,
		url: "https://www.fab.com/sellers/acme-studio",
	});
	await flushExtensionWork();

	expect(
		page.document.querySelector(
			".better-fab-seller-profile-count",
		)?.textContent,
	).toBe("7 reviews across 1 package");
});

test("an old product request cannot add a profile after navigation", async () => {
	const requests = [];
	const page = await loadProductPage({
		fetchSeller: () => {
			const request = deferred();
			requests.push(request);
			return request.promise;
		},
	});

	page.window.history.pushState({}, "", "/products/another-product");
	page.updateStorage({
		hiddenSellers: { newValue: ["another-seller"] },
	});
	await flushExtensionWork();

	requests[0].resolve({
		ok: true,
		text: async () => "<!doctype html><h1>Acme</h1>",
	});
	await flushExtensionWork();

	expect(page.document.getElementById("better-fab-product-profile")).toBeNull();
});

test("an old product request cannot add a profile after disable", async () => {
	const request = deferred();
	const page = await loadProductPage({
		fetchSeller: () => request.promise,
	});

	page.updateStorage({
		extensionActive: { newValue: false },
	});
	request.resolve({
		ok: true,
		text: async () => "<!doctype html><h1>Acme</h1>",
	});
	await flushExtensionWork();

	expect(page.document.getElementById("better-fab-product-profile")).toBeNull();
});

test("disabling the extension removes the product widget", async () => {
	const request = deferred();
	const page = await loadProductPage({
		fetchSeller: () => request.promise,
	});

	page.updateStorage({
		extensionActive: { newValue: false },
	});

	expect(page.document.getElementById("better-fab-product-widget")).toBeNull();
});

test("re-enabling the same product starts a fresh seller request", async () => {
	let requestCount = 0;
	const page = await loadProductPage({
		fetchSeller: () => {
			requestCount += 1;
			return deferred().promise;
		},
	});

	page.updateStorage({
		extensionActive: { newValue: false },
	});
	page.updateStorage({
		extensionActive: { newValue: true },
	});

	expect(requestCount).toBe(2);
});

test("a pre-disable request cannot replace the re-enabled product profile", async () => {
	const requests = [];
	const page = await loadProductPage({
		fetchSeller: () => {
			const request = deferred();
			requests.push(request);
			return request.promise;
		},
	});

	page.updateStorage({
		extensionActive: { newValue: false },
	});
	page.updateStorage({
		extensionActive: { newValue: true },
	});
	requests[1].resolve(
		sellerMetricsResponse({ rating: "2.0", reviews: 20, slug: "new" }),
	);
	await flushExtensionWork();
	requests[0].resolve(
		sellerMetricsResponse({ rating: "4.0", reviews: 10, slug: "old" }),
	);
	await flushExtensionWork();

	expect(
		page.document.querySelector(
			"#better-fab-product-profile .better-fab-seller-profile-average",
		)?.textContent,
	).toBe("2.0 / 5");
});

test("a storage change refreshes the existing product seller button", async () => {
	const page = await loadProductPage({
		fetchSeller: async () => ({ ok: false }),
	});
	const sellerLink = page.document.querySelector('a[href^="/sellers/"]');
	sellerLink.href = "/sellers/bravo";
	sellerLink.textContent = "Bravo";

	page.updateStorage({
		hiddenSellers: { newValue: ["bravo"] },
	});
	await flushExtensionWork();

	const button = page.document.querySelector(
		"#better-fab-product-widget button",
	);
	expect({
		disabled: button.disabled,
		label: button.textContent,
		seller: button.dataset.seller,
	}).toEqual({
		disabled: true,
		label: "Seller removed from listings",
		seller: "bravo",
	});
});

test("a same-path seller change replaces the successful product profile", async () => {
	const requestedSellers = [];
	const page = await loadProductPage({
		fetchSeller: async (sellerHref) => {
			requestedSellers.push(sellerHref);
			return sellerHref === "/sellers/acme"
				? sellerMetricsResponse({ rating: "4.0", reviews: 10, slug: "acme" })
				: sellerMetricsResponse({ rating: "2.0", reviews: 20, slug: "bravo" });
		},
	});
	await flushExtensionWork();

	const sellerLink = page.document.querySelector('a[href^="/sellers/"]');
	sellerLink.href = "/sellers/bravo";
	sellerLink.textContent = "Bravo";
	page.updateStorage({
		hiddenSellers: { newValue: ["profile-refresh"] },
	});
	await flushExtensionWork();

	expect({
		average: page.document.querySelector(
			"#better-fab-product-profile .better-fab-seller-profile-average",
		)?.textContent,
		requestedSellers,
	}).toEqual({
		average: "2.0 / 5",
		requestedSellers: ["/sellers/acme", "/sellers/bravo"],
	});
});

test("a failed seller refresh removes the previous seller profile", async () => {
	const page = await loadProductPage({
		fetchSeller: async (sellerHref) =>
			sellerHref === "/sellers/acme"
				? sellerMetricsResponse({ rating: "4.0", reviews: 10, slug: "acme" })
				: { ok: false },
	});
	await flushExtensionWork();
	expect(page.document.getElementById("better-fab-product-profile")).not.toBeNull();

	const sellerLink = page.document.querySelector('a[href^="/sellers/"]');
	sellerLink.href = "/sellers/bravo";
	sellerLink.textContent = "Bravo";
	page.updateStorage({
		hiddenSellers: { newValue: ["profile-refresh"] },
	});
	await flushExtensionWork();

	expect(page.document.getElementById("better-fab-product-profile")).toBeNull();
});

test("a product-only SPA mutation refreshes seller metrics without a storage change", async () => {
	const requestedSellers = [];
	const page = await loadProductPage({
		fetchSeller: async (sellerHref) => {
			requestedSellers.push(sellerHref);
			return sellerHref === "/sellers/acme"
				? sellerMetricsResponse({ rating: "4.0", reviews: 10, slug: "acme" })
				: sellerMetricsResponse({ rating: "2.0", reviews: 20, slug: "bravo" });
		},
	});
	await flushExtensionWork();

	const sellerLink = page.document.querySelector('a[href^="/sellers/"]');
	sellerLink.href = "/sellers/bravo";
	sellerLink.textContent = "Bravo";
	page.window.history.pushState({}, "", "/products/another-product");
	const productMutation = page.document.createElement("span");
	page.document.querySelector("main").appendChild(productMutation);
	page.mutateProductPage(productMutation);
	await flushExtensionWork();
	await flushExtensionWork();

	expect({
		average: page.document.querySelector(
			"#better-fab-product-profile .better-fab-seller-profile-average",
		)?.textContent,
		requestedSellers,
	}).toEqual({
		average: "2.0 / 5",
		requestedSellers: ["/sellers/acme", "/sellers/bravo"],
	});
});

test("a replaced product widget restores an already-rendered profile", async () => {
	let requestCount = 0;
	const page = await loadProductPage({
		fetchSeller: async () => {
			requestCount += 1;
			return sellerMetricsResponse({ rating: "4.0", reviews: 10, slug: "acme" });
		},
	});
	await flushExtensionWork();
	page.document.getElementById("better-fab-product-widget").remove();

	const productMutation = page.document.createElement("span");
	page.document.querySelector("main").appendChild(productMutation);
	page.mutateProductPage(productMutation);
	await flushExtensionWork();
	await flushExtensionWork();

	expect({
		profileConnected:
			page.document.getElementById("better-fab-product-profile")?.isConnected,
		requestCount,
	}).toEqual({ profileConnected: true, requestCount: 2 });
});

test("an in-flight seller response targets a replacement product widget", async () => {
	const request = deferred();
	const page = await loadProductPage({
		fetchSeller: () => request.promise,
	});
	page.document.getElementById("better-fab-product-widget").remove();

	const productMutation = page.document.createElement("span");
	page.document.querySelector("main").appendChild(productMutation);
	page.mutateProductPage(productMutation);
	await flushExtensionWork();
	request.resolve(
		sellerMetricsResponse({ rating: "4.0", reviews: 10, slug: "acme" }),
	);
	await flushExtensionWork();

	expect(
		page.document.getElementById("better-fab-product-profile")?.isConnected,
	).toBe(true);
});
