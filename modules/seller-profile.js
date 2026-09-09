(function installSellerProfileModule(globalScope) {
	"use strict";

	function getEntryMetricRichness(entry) {
		const metrics = entry.metrics || {};
		return (
			(metrics.reviewCount === null || metrics.reviewCount === undefined ? 0 : 2) +
			(metrics.rating === null || metrics.rating === undefined ? 0 : 1)
		);
	}

	function hasCompleteMetrics(entry) {
		return getEntryMetricRichness(entry) === 3;
	}

	function mergeDuplicateEntries(existing, candidate) {
		if (hasCompleteMetrics(existing)) return existing;
		if (hasCompleteMetrics(candidate)) return candidate;

		const preferred =
			getEntryMetricRichness(candidate) > getEntryMetricRichness(existing)
				? candidate
				: existing;
		const alternate = preferred === existing ? candidate : existing;
		const preferredMetrics = preferred.metrics || {};
		const alternateMetrics = alternate.metrics || {};
		return {
			...preferred,
			metrics: {
				...preferredMetrics,
				rating:
					preferredMetrics.rating === null ||
					preferredMetrics.rating === undefined
						? alternateMetrics.rating
						: preferredMetrics.rating,
				reviewCount:
					preferredMetrics.reviewCount === null ||
					preferredMetrics.reviewCount === undefined
						? alternateMetrics.reviewCount
						: preferredMetrics.reviewCount,
			},
		};
	}

	function deduplicateEntries(entries, source) {
		const entriesByListingIdentity = new Map();

		for (const entry of entries) {
			const href = source.getFirstListingHref(entry.card);
			const identity = source.getListingIdentity?.(href) || href;
			const key = identity || entry;
			const existing = entriesByListingIdentity.get(key);
			entriesByListingIdentity.set(
				key,
				existing ? mergeDuplicateEntries(existing, entry) : entry,
			);
		}

		return [...entriesByListingIdentity.values()];
	}

	function selectEntries(entries, sellerName, source) {
		if (!sellerName) return deduplicateEntries(entries, source);
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
			return deduplicateEntries(potentialEntries, source);
		}

		const primaryGrid = potentialEntries[0].card.parentElement;
		return deduplicateEntries(
			potentialEntries.filter(
				(entry) => entry.card.parentElement === primaryGrid,
			),
			source,
		);
	}

	function summarize(entries) {
		const totalPackages = entries.length;
		let ratedPackages = 0;
		let reviewedPackages = 0;
		let totalReviews = 0;
		let ratedReviewCount = 0;
		let weightedTotal = 0;
		let ratingTotal = 0;

		for (const entry of entries) {
			const { rating, reviewCount } = entry.metrics;
			if (reviewCount !== null && reviewCount > 0) {
				totalReviews += reviewCount;
			}

			if (rating === null) continue;
			ratedPackages += 1;
			ratingTotal += rating;
			if (reviewCount === null || reviewCount <= 0) continue;

			reviewedPackages += 1;
			ratedReviewCount += reviewCount;
			weightedTotal += rating * reviewCount;
		}

		if (ratedReviewCount > 0) {
			return {
				average: weightedTotal / ratedReviewCount,
				totalPackages,
				totalReviews,
				ratedPackages: reviewedPackages,
			};
		}

		if (ratedPackages > 0) {
			return {
				average: ratingTotal / ratedPackages,
				totalPackages,
				totalReviews,
				ratedPackages,
			};
		}

		return {
			average: null,
			totalPackages,
			totalReviews,
			ratedPackages: 0,
		};
	}

	function formatCount(value) {
		return Math.round(value).toLocaleString();
	}

	function present(summary) {
		const averageText =
			summary.average === null
				? summary.totalReviews > 0
					? "Rating unavailable"
					: "No ratings yet"
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
