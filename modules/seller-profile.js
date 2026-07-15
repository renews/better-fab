(function installSellerProfileModule(globalScope) {
	"use strict";

	function selectEntries(entries, sellerName, source) {
		if (!sellerName) return [...entries];
		const normalizedSeller = String(sellerName).trim().toLowerCase();
		const sourceSellerIdentity = String(
			source.getSourceSellerName?.() || "",
		)
			.trim()
			.toLowerCase();

		const potentialEntries = entries.filter((entry) => {
			if (!source.getFirstListingHref(entry.card)) return false;
			if (!source.isAfterHeading(entry.card)) return false;
			if (!source.isSellerOwnedListing(entry.card)) return false;

			const entrySellerName = entry.metrics?.sellerName || "";
			const entrySellerIdentity = entry.metrics?.sellerIdentity || "";
			if (entrySellerIdentity && sourceSellerIdentity) {
				return entrySellerIdentity === sourceSellerIdentity;
			}
			return entrySellerName === "" || entrySellerName === normalizedSeller;
		});

		if (potentialEntries.length === 0 || source.isSellerPage()) {
			return potentialEntries;
		}

		const primaryGrid = potentialEntries[0].card.parentElement;
		return potentialEntries.filter(
			(entry) => entry.card.parentElement === primaryGrid,
		);
	}

	function summarize(entries) {
		const totalPackages = entries.length;
		let ratedPackages = 0;
		let reviewedPackages = 0;
		let totalReviews = 0;
		let weightedTotal = 0;
		let ratingTotal = 0;

		for (const entry of entries) {
			const { rating, reviewCount } = entry.metrics;
			if (rating === null) continue;

			ratedPackages += 1;
			ratingTotal += rating;
			if (reviewCount === null || reviewCount <= 0) continue;

			reviewedPackages += 1;
			totalReviews += reviewCount;
			weightedTotal += rating * reviewCount;
		}

		if (totalReviews > 0) {
			return {
				average: weightedTotal / totalReviews,
				totalPackages,
				totalReviews,
				ratedPackages: reviewedPackages,
			};
		}

		if (ratedPackages > 0) {
			return {
				average: ratingTotal / ratedPackages,
				totalPackages,
				totalReviews: 0,
				ratedPackages,
			};
		}

		return {
			average: null,
			totalPackages,
			totalReviews: 0,
			ratedPackages: 0,
		};
	}

	function formatCount(value) {
		return Math.round(value).toLocaleString();
	}

	function present(summary) {
		const averageText =
			summary.average === null
				? "No ratings yet"
				: `${summary.average.toFixed(1)} / 5`;
		const reviewText =
			summary.totalReviews > 0
				? `${formatCount(summary.totalReviews)} reviews`
				: "0 reviews";
		const packageText =
			summary.totalPackages === 1
				? "1 package"
				: `${formatCount(summary.totalPackages)} packages`;

		return Object.freeze({
			averageText,
			countText: `${reviewText} across ${packageText}`,
		});
	}

	function analyze({ entries, sellerName, source }) {
		if (!source) throw new Error("Seller Profile requires a Fab DOM source");
		const selectedEntries = selectEntries(entries, sellerName, source);
		const summary = summarize(selectedEntries);
		return Object.freeze({
			entries: selectedEntries,
			presentation: present(summary),
			summary,
		});
	}

	const modules = (globalScope.BetterFabModules ||= {});
	modules.sellerProfile = Object.freeze({ analyze, present, summarize });
})(globalThis);
