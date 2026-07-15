import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";

const adapterSource = await Bun.file(
	new URL("../modules/fab-dom-adapter.js", import.meta.url),
).text();

function loadFabDomModule() {
	const moduleGlobal = {};
	new Function("globalThis", adapterSource)(moduleGlobal);
	return moduleGlobal.BetterFabModules.fabDom;
}

test("live Fab DOM adapter discovers listing cards without navigation links", () => {
	const dom = new JSDOM(`<!doctype html>
		<body>
			<section id="grid">
				<article id="first"><a href="/listings/first">First asset</a></article>
				<article id="second"><a href="/products/second">Second asset</a></article>
				<a href="/sellers/acme">Acme</a>
				<a href="/search?q=asset">Search</a>
			</section>
		</body>`);
	const fabDom = loadFabDomModule();
	const adapter = fabDom.create({
		root: dom.window.document,
		sourceLocation: "/channels/assets",
		origin: "https://www.fab.com",
	});

	const listingNodes = adapter.getListingNodes();

	expect({
		cards: listingNodes.map((node) => adapter.getCard(node).id),
		hrefs: listingNodes.map((node) => node.getAttribute("href")),
		isSellerPage: adapter.isSellerPage(),
	}).toEqual({
		cards: ["first", "second"],
		hrefs: ["/listings/first", "/products/second"],
		isSellerPage: false,
	});
});

test("fetched Fab DOM adapter derives seller identity from its source location", () => {
	const dom = new JSDOM(`<!doctype html>
		<body>
			<article><a href="/products/acme-one">Acme one</a></article>
		</body>`);
	const fabDom = loadFabDomModule();
	const adapter = fabDom.create({
		root: dom.window.document,
		sourceLocation: "/sellers/Acme%20Studio?sort=rating",
		origin: "https://www.fab.com",
	});

	expect({
		isSellerPage: adapter.isSellerPage(),
		sellerName: adapter.getSourceSellerName(),
		listingCount: adapter.getListingNodes().length,
	}).toEqual({
		isSellerPage: true,
		sellerName: "acme studio",
		listingCount: 1,
	});
});

test("Fab DOM adapter classifies marketplace navigation separately from actions", () => {
	const dom = new JSDOM(`<!doctype html>
		<body>
			<a id="product" href="/products/owned-pack">Owned pack</a>
			<a id="seller" href="/sellers/owned-studio">Owned Studio</a>
			<button id="status" aria-label="In library"></button>
		</body>`);
	const fabDom = loadFabDomModule();
	const adapter = fabDom.create({
		root: dom.window.document,
		sourceLocation: "/search",
		origin: "https://www.fab.com",
	});

	expect({
		product: adapter.isMarketplaceNavigationLink(
			dom.window.document.getElementById("product"),
		),
		seller: adapter.isMarketplaceNavigationLink(
			dom.window.document.getElementById("seller"),
		),
		status: adapter.isMarketplaceNavigationLink(
			dom.window.document.getElementById("status"),
		),
	}).toEqual({ product: true, seller: true, status: false });
});

test("extension loads the Fab DOM adapter before the content adapter", async () => {
	const manifest = await Bun.file(
		new URL("../manifest.json", import.meta.url),
	).json();

	const scripts = manifest.content_scripts[0].js;
	expect(scripts.indexOf("modules/fab-dom-adapter.js")).toBeLessThan(
		scripts.indexOf("content.js"),
	);
});
