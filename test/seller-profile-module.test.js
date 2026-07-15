import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";

const fabDomSource = await Bun.file(
	new URL("../modules/fab-dom-adapter.js", import.meta.url),
).text();
const sellerProfileSource = await Bun.file(
	new URL("../modules/seller-profile.js", import.meta.url),
).text();

function loadModules() {
	const moduleGlobal = {};
	new Function("globalThis", fabDomSource)(moduleGlobal);
	new Function("globalThis", sellerProfileSource)(moduleGlobal);
	return moduleGlobal.BetterFabModules;
}

function createSellerFixture(sourceLocation) {
	const dom = new JSDOM(`<!doctype html>
		<body>
			<h1>Acme Studio</h1>
			<section id="primary">
				<article id="one"><a href="/products/one">One</a></article>
				<article id="two"><a href="/products/two">Two</a></article>
			</section>
		</body>`);
	const modules = loadModules();
	const source = modules.fabDom.create({
		root: dom.window.document,
		sourceLocation,
		origin: "https://www.fab.com",
	});
	const listingNodes = source.getListingNodes();
	return {
		dom,
		modules,
		source,
		entries: [
			{
				card: source.getCard(listingNodes[0]),
				metrics: { rating: 4, reviewCount: 2, sellerName: "acme studio" },
			},
			{
				card: source.getCard(listingNodes[1]),
				metrics: { rating: 2, reviewCount: 1, sellerName: "acme studio" },
			},
		],
	};
}

test("Seller Profile produces the same result for live and fetched seller sources", () => {
	const live = createSellerFixture("/sellers/acme-studio");
	const fetched = createSellerFixture("/sellers/acme-studio?sort=rating");

	const liveResult = live.modules.sellerProfile.analyze({
		entries: live.entries,
		sellerName: "acme studio",
		source: live.source,
	});
	const fetchedResult = fetched.modules.sellerProfile.analyze({
		entries: fetched.entries,
		sellerName: "acme studio",
		source: fetched.source,
	});

	expect({
		live: { presentation: liveResult.presentation, summary: liveResult.summary },
		fetched: {
			presentation: fetchedResult.presentation,
			summary: fetchedResult.summary,
		},
	}).toEqual({
		live: {
			presentation: {
				averageText: "3.3 / 5",
				countText: "3 reviews across 2 packages",
			},
			summary: {
				average: 10 / 3,
				ratedPackages: 2,
				totalPackages: 2,
				totalReviews: 3,
			},
		},
		fetched: {
			presentation: {
				averageText: "3.3 / 5",
				countText: "3 reviews across 2 packages",
			},
			summary: {
				average: 10 / 3,
				ratedPackages: 2,
				totalPackages: 2,
				totalReviews: 3,
			},
		},
	});
});

test("Seller Profile limits non-seller sources to the primary listing grid", () => {
	const fixture = createSellerFixture("/products/example");
	const secondary = fixture.dom.window.document.createElement("section");
	secondary.innerHTML = '<article><a href="/products/related">Related</a></article>';
	fixture.dom.window.document.body.appendChild(secondary);
	const relatedLink = secondary.querySelector("a");
	fixture.entries.push({
		card: fixture.source.getCard(relatedLink),
		metrics: { rating: 5, reviewCount: 100, sellerName: "acme studio" },
	});

	const result = fixture.modules.sellerProfile.analyze({
		entries: fixture.entries,
		sellerName: "acme studio",
		source: fixture.source,
	});

	expect({
		entryIds: result.entries.map((entry) => entry.card.id),
		totalReviews: result.summary.totalReviews,
	}).toEqual({ entryIds: ["one", "two"], totalReviews: 3 });
});

test("Seller Profile excludes unrelated sections without collapsing seller grids", () => {
	const dom = new JSDOM(`<!doctype html>
		<body>
			<h1>Acme Studio</h1>
			<section id="primary">
				<article id="one"><a href="/products/one">One</a></article>
			</section>
			<section id="continued">
				<article id="two"><a href="/products/two">Two</a></article>
			</section>
			<h2>Related products</h2>
			<section id="related">
				<article id="other"><a href="/products/other">Other</a></article>
			</section>
		</body>`);
	const modules = loadModules();
	const entries = [
		{
			card: dom.window.document.getElementById("one"),
			metrics: { rating: 4, reviewCount: 2, sellerName: "" },
		},
		{
			card: dom.window.document.getElementById("two"),
			metrics: { rating: 2, reviewCount: 1, sellerName: "" },
		},
		{
			card: dom.window.document.getElementById("other"),
			metrics: { rating: 5, reviewCount: 100, sellerName: "" },
		},
	];

	const analyze = (sourceLocation) =>
		modules.sellerProfile.analyze({
			entries,
			sellerName: "acme studio",
			source: modules.fabDom.create({
				root: dom.window.document,
				sourceLocation,
				origin: "https://www.fab.com",
			}),
		});
	const live = analyze("/sellers/acme-studio");
	const fetched = analyze("/sellers/acme-studio?sort=rating");

	expect({
		fetched: {
			countText: fetched.presentation.countText,
			entryIds: fetched.entries.map((entry) => entry.card.id),
		},
		live: {
			countText: live.presentation.countText,
			entryIds: live.entries.map((entry) => entry.card.id),
		},
	}).toEqual({
		fetched: {
			countText: "3 reviews across 2 packages",
			entryIds: ["one", "two"],
		},
		live: {
			countText: "3 reviews across 2 packages",
			entryIds: ["one", "two"],
		},
	});
});

test("extension loads Seller Profile after Fab DOM and before the content adapter", async () => {
	const manifest = await Bun.file(
		new URL("../manifest.json", import.meta.url),
	).json();

	const scripts = manifest.content_scripts[0].js;
	const fabDomIndex = scripts.indexOf("modules/fab-dom-adapter.js");
	const sellerProfileIndex = scripts.indexOf("modules/seller-profile.js");
	const contentIndex = scripts.indexOf("content.js");
	expect(fabDomIndex).toBeLessThan(sellerProfileIndex);
	expect(sellerProfileIndex).toBeLessThan(contentIndex);
});
