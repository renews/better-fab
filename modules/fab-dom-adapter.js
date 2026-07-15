(function installFabDomAdapter(globalScope) {
	"use strict";

	const THUMBNAIL_CLASS = "fabkit-Thumbnail-root";
	const LICENSE_MODAL_SELECTOR = 'div[role="dialog"][aria-modal="true"]';
	const UNRELATED_LISTING_HEADING_PATTERN =
		/\b(?:related|recommended|you may also like|more like this)\b/i;
	const listingNodeCardCache = new WeakMap();

	function getSellerNameFromPathname(pathname) {
		const match = String(pathname || "").match(/^\/sellers\/([^/?#]+)/i);
		if (!match) return "";

		try {
			return decodeURIComponent(match[1].replace(/\+/g, " "))
				.trim()
				.toLowerCase();
		} catch (_error) {
			return match[1].trim().toLowerCase();
		}
	}

	function getSellerNameFromHref(href) {
		const match = String(href || "").match(/\/sellers\/([^?#]+)/i);
		if (!match) return "";
		return getSellerNameFromPathname(`/sellers/${match[1]}`);
	}

	function isProductOrListingHref(href) {
		if (!href) return false;
		const lowerHref = String(href).toLowerCase();
		if (
			lowerHref.includes("/tags/") ||
			lowerHref.includes("/category/") ||
			lowerHref.includes("/channels/") ||
			lowerHref.includes("/collections/") ||
			lowerHref.includes("/sellers/") ||
			lowerHref.includes("/about/") ||
			lowerHref.includes("/search") ||
			lowerHref.includes("/login") ||
			lowerHref.includes("/cart") ||
			lowerHref.includes("/library")
		) {
			return false;
		}

		if (
			/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i.test(
				href,
			)
		) {
			return true;
		}
		if (
			/\/([a-z]{2}(?:-[a-zA-Z]{2,4})?\/)?(products|listings|models|assets|items|plugins|environments|materials|characters|vehicles|weapons|props)\//i.test(
				href,
			)
		) {
			return true;
		}
		if (/\/\d+-[a-z0-9-]+/i.test(href)) return true;

		const path = String(href).split("?")[0].split("#")[0];
		const segments = path.split("/").filter(Boolean);
		return (
			segments.length >= 2 &&
			!lowerHref.startsWith("javascript:") &&
			!lowerHref.startsWith("mailto:")
		);
	}

	function isMarketplaceNavigationLink(element) {
		if (element?.tagName !== "A") return false;
		const href = String(element.getAttribute("href") || "");
		return (
			isProductOrListingHref(href) || href.toLowerCase().includes("/sellers/")
		);
	}

	function create({ root, sourceLocation = "", origin = "https://www.fab.com" }) {
		if (!root) throw new Error("Fab DOM adapter requires a root");

		const ownerDocument = root.nodeType === 9 ? root : root.ownerDocument;
		const body = ownerDocument?.body || null;

		function isProductOrListingLink(node) {
			return (
				node?.localName === "a" &&
				isProductOrListingHref(node.getAttribute("href") || "")
			);
		}

		function getFirstListingHref(node) {
			const links = node?.getElementsByTagName?.("a");
			if (!links) return "";

			for (const link of links) {
				const href = link.getAttribute("href") || "";
				if (isProductOrListingHref(href)) return href;
			}
			return "";
		}

		function getProductOrListingLinks(targetRoot = root) {
			const links = targetRoot?.getElementsByTagName?.("a");
			const listingLinks = [];
			if (!links) return listingLinks;

			for (const link of links) {
				if (isProductOrListingHref(link.getAttribute("href") || "")) {
					listingLinks.push(link);
				}
			}
			return listingLinks;
		}

		function getListingDescendants(
			targetRoot,
			limit = Number.POSITIVE_INFINITY,
		) {
			const listingNodes = [];
			const thumbnails = targetRoot?.getElementsByClassName?.(THUMBNAIL_CLASS);
			if (thumbnails) {
				for (const thumbnail of thumbnails) {
					listingNodes.push(thumbnail);
					if (listingNodes.length >= limit) return listingNodes;
				}
			}

			for (const link of getProductOrListingLinks(targetRoot)) {
				listingNodes.push(link);
				if (listingNodes.length >= limit) return listingNodes;
			}
			return listingNodes;
		}

		function getCachedCard(listingNode) {
			const cached = listingNodeCardCache.get(listingNode);
			if (!cached?.isConnected) return null;
			if (!cached.contains(listingNode)) return null;
			return cached;
		}

		function cacheCard(listingNode, card) {
			if (card) listingNodeCardCache.set(listingNode, card);
			return card;
		}

		function getCard(listingNode) {
			if (!listingNode) return null;
			if (listingNode.closest?.(LICENSE_MODAL_SELECTOR)) return null;

			const cachedCard = getCachedCard(listingNode);
			if (cachedCard) return cachedCard;

			let node = listingNode;
			let attempts = 0;
			while (node && node !== body && attempts < 16) {
				const parent = node.parentElement;
				if (parent && parent !== body && parent.children.length >= 2) {
					const uniqueHrefs = new Set();
					for (const sibling of parent.children) {
						const href = getFirstListingHref(sibling);
						if (!href) continue;
						uniqueHrefs.add(href.split("?")[0].split("#")[0]);
						if (uniqueHrefs.size >= 2) {
							return cacheCard(listingNode, node);
						}
					}
				}
				node = node.parentElement;
				attempts += 1;
			}

			return cacheCard(listingNode, listingNode.parentElement);
		}

		function addListingDescendantCards(targetRoot, changedCards) {
			let foundListingNode = false;
			for (const listingNode of getListingDescendants(targetRoot)) {
				foundListingNode = true;
				const card = getCard(listingNode);
				if (card) changedCards.add(card);
			}
			return foundListingNode;
		}

		function isListingNode(node) {
			return (
				node?.classList?.contains(THUMBNAIL_CLASS) ||
				isProductOrListingLink(node)
			);
		}

		function getListingNodes() {
			const listingLinks = getProductOrListingLinks();
			if (listingLinks.length > 0) return listingLinks;
			return Array.from(root.getElementsByClassName?.(THUMBNAIL_CLASS) || []);
		}

		function isAfterHeading(element) {
			const heading = root.querySelector?.("h1");
			if (!heading || typeof heading.compareDocumentPosition !== "function") {
				return true;
			}

			const followingPosition =
				ownerDocument?.defaultView?.Node?.DOCUMENT_POSITION_FOLLOWING || 4;
			return Boolean(
				heading.compareDocumentPosition(element) & followingPosition,
			);
		}

		function isSellerOwnedListing(element) {
			if (getSellerNameFromHref(sourceLocation) === "") return true;

			const headings = root.querySelectorAll?.(
				'h1, h2, h3, h4, h5, h6, [role="heading"]',
			);
			if (!headings) return true;

			const followingPosition =
				ownerDocument?.defaultView?.Node?.DOCUMENT_POSITION_FOLLOWING || 4;
			let nearestHeading = null;
			for (const heading of headings) {
				if (
					typeof heading.compareDocumentPosition === "function" &&
					heading.compareDocumentPosition(element) & followingPosition
				) {
					nearestHeading = heading;
				}
			}

			const headingText = String(
				nearestHeading?.textContent ||
					nearestHeading?.getAttribute?.("aria-label") ||
					"",
			);
			return !UNRELATED_LISTING_HEADING_PATTERN.test(headingText);
		}

		return Object.freeze({
			addListingDescendantCards,
			getCard,
			getFirstListingHref,
			getListingDescendants,
			getListingNodes,
			getProductOrListingLinks,
			getSourceSellerName: () => getSellerNameFromHref(sourceLocation),
			isListingNode,
			isAfterHeading,
			isMarketplaceNavigationLink,
			isProductOrListingLink,
			isSellerOwnedListing,
			isSellerPage: () => getSellerNameFromHref(sourceLocation) !== "",
			origin,
			root,
			sourceLocation,
		});
	}

	const modules = (globalScope.BetterFabModules ||= {});
	modules.fabDom = Object.freeze({
		create,
		getSellerNameFromHref,
		getSellerNameFromPathname,
		isMarketplaceNavigationLink,
		isProductOrListingHref,
	});
})(globalThis);
