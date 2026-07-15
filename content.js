const FabDomModule = globalThis.BetterFabModules?.fabDom;
if (!FabDomModule) {
	throw new Error("Better Fab DOM adapter did not load before content.js");
}
const SellerProfileModule = globalThis.BetterFabModules?.sellerProfile;
if (!SellerProfileModule) {
	throw new Error("Better Fab Seller Profile did not load before content.js");
}
const MassAddModule = globalThis.BetterFabModules?.massAdd;
if (!MassAddModule) {
	throw new Error("Better Fab Mass-Add did not load before content.js");
}
const ProcessingCoordinatorModule =
	globalThis.BetterFabModules?.processingCoordinator;
if (!ProcessingCoordinatorModule) {
	throw new Error(
		"Better Fab processing coordinator did not load before content.js",
	);
}

function createFabDomAdapter(
	root = document,
	sourceLocation = window.location.pathname,
) {
	return FabDomModule.create({
		root,
		sourceLocation,
		origin: window.location.origin,
	});
}

let config = {
	filterActive: true,
	hiddenSellers: [],
	applySellerFilterInLibrary: false,
	applySavedFilterOnSellerPage: true,
	minimumReviewCount: 0,
	hiddenKeywords: [],
	sortStarsByReviewCount: false,
	showHideSellerButtons: true,
	starSortModeSelector: "",
	starSortModeMatch: "",
	activeFilterPresets: {
		"no-ai": false,
		"rated-4plus-3-reviews": false,
	},
	extensionActive: true,
};

const MassAddSession = MassAddModule.create({
	document,
	getCardMetrics,
	getSource: () => createFabDomAdapter(document),
	hasSavedItemMarker,
	isActive: () => config.extensionActive,
	notify: alert,
	window,
});
let lastProcessedListingSignature = "";
let lastProcessItemsCompletedAt = 0;
let hiddenSellerSet = new Set();
let activeIncludeFilterPresets = [];
let activeExcludeFilterPresets = [];
let hasActiveFilterPresets = false;
let filterSettingsVersion = 0;
let cardContentVersion = 0;
let sellerProfileElement = null;
let needsExtensionCleanup = false;
let potentialStarSortWorkCache = {
	signature: "",
	value: false,
};
let potentialCardProcessingWorkCache = {
	pathname: "",
	filterSettingsVersion: -1,
	potentialStarSortWork: null,
	isSellerPage: null,
	showHideSellerButtons: null,
	value: false,
};
let knownStarSortQueryModeCache = {
	search: "",
	value: false,
};
let configuredQueryMatchCache = {
	signature: "",
	value: null,
};
let extensionSettingsLoadAttempts = 0;


const STAR_SORT_INDICATOR = /rating|reviews?|stars?/i;
const STAR_SORT_QUERY_KEYS = [
	"sort",
	"sort_by",
	"orderby",
	"order_by",
	"sortorder",
];
const STAR_SORT_QUERY_KEY_SET = new Set(STAR_SORT_QUERY_KEYS);
const STAR_SORT_QUERY_FRAGMENT = "ratings.averagerating";
const THUMBNAIL_CLASS = "fabkit-Thumbnail-root";
const IGNORE_SELLER_CARD_CLASS = "better-fab-ignore-seller-card";
const IGNORE_SELLER_BUTTON_CLASS = "better-fab-ignore-seller-btn";
const SELLER_PROFILE_CLASS = "better-fab-seller-profile";
const SELLER_PROFILE_AVERAGE_CLASS = "better-fab-seller-profile-average";
const SELLER_PROFILE_COUNT_CLASS = "better-fab-seller-profile-count";
const SELLER_PAGE_BUTTON_CLASS = "better-fab-seller-page-ignore-btn";
const SELLER_ROW_CLASS = "better-fab-seller-row";
const IGNORE_SELLER_BUTTON_SELECTOR = `.${IGNORE_SELLER_BUTTON_CLASS}`;
const SELLER_PROFILE_SELECTOR = `.${SELLER_PROFILE_CLASS}`;
const SELLER_PROFILE_AVERAGE_SELECTOR = `.${SELLER_PROFILE_AVERAGE_CLASS}`;
const SELLER_PROFILE_COUNT_SELECTOR = `.${SELLER_PROFILE_COUNT_CLASS}`;
const SELLER_PAGE_BUTTON_SELECTOR = `.${SELLER_PAGE_BUTTON_CLASS}`;
const SAVED_ITEM_SUCCESS_CLASS = "fabkit-Typography--intent-success";
const SAVED_ITEM_ICON_CLASS = "edsicon-check-circle-filled";
const CARD_TEXT_ATTRIBUTE_SELECTOR =
	"[aria-label], [title], [alt], [data-tip], [data-value], [data-type], [data-category], [data-kind], [data-item-type], [data-tags]";
const CARD_TEXT_ATTRIBUTES = [
	"aria-label",
	"title",
	"alt",
	"data-tip",
	"data-value",
];
const FAB_RATING_COUNT_PATTERN =
	/(?:^|[^\d.])([0-5](?:\.\d+)?)\s*\((\d{1,3}(?:[.,]\d{3})+|\d+(?:\.\d+)?\s*[kKmM]|\d+)\)/i;
const REVIEW_COUNT_PATTERNS = [
	/\b[0-5](?:\.\d+)?\s*\((\d{1,3}(?:[.,]\d{3})+|\d+(?:\.\d+)?\s*[kKmM]|\d+)\)/i,
	/(\d{1,3}(?:[.,]\d{3})+|\d+)\s*reviews?/i,
	/(\d+(?:\.\d+)?\s*[kKmM])\s*reviews?/i,
	/(\d{1,3}(?:[.,]\d{3})+|\d+)\s*ratings?/i,
	/(\d+(?:\.\d+)?\s*[kKmM])\s*ratings?/i,
	/\((\d{1,3}(?:[.,]\d{3})+|\d+)\s*reviews?\)/i,
	/review[s]?\s*[:\-]?\s*(\d{1,3}(?:[.,]\d{3})+|\d+)/i,
];
const RATING_PATTERNS = [
	/(?:^|\s|[^\d])([0-5](?:\.\d+)?)\s*\/\s*5\b/i,
	/([0-5](?:\.\d+)?)\s*(?:out of|of)\s*5\s*stars?/i,
	/([0-5](?:\.\d+)?)\s*stars?/i,
];
const PRESET_KEYWORDS = {
	ai: [
		/\bai[\s-]?generated\b/i,
		/\bai[-\s]?assisted\b/i,
		/\b(?:created|generated|made|produced)\s+(?:with|by|using)\s+(?:an?\s*)?(?:artificial\s+intelligence|generative\s+ai|text[-\s]?to[-\s]?image|ai)\b/i,
		/\b(?:text[-\s]?to[-\s]?image|image[-\s]?to[-\s]?image)\b/i,
		/\b(?:midjourney|stable\s*diffusion|dall[-\s]?e|sora|chatgpt|runway|replicate|civitai|leonardo)\b/i,
	],
	aiUrlOrLabel:
		/(?:^|[\s-])ai[-\s](?:art|assets?|model|generator|generated|generated-content)(?:\b|$)|\/channels\/ai\b/i,
};
const CARD_METRICS_CACHE = new WeakMap();
const CARD_SELLER_INFO_CACHE = new WeakMap();
const CARD_FILTER_RESULT_CACHE = new WeakMap();
const CARD_CONTENT_VERSION_CACHE = new WeakMap();
const CARD_DOM_SIGNATURE_CACHE = new WeakMap();
const EMPTY_ENTRIES = [];
const EXTENSION_SETTINGS_LOAD_ATTEMPTS = 3;
const EXTENSION_SETTINGS_RETRY_DELAY_MS = 250;
const PRODUCT_SELLER_FETCH_ATTEMPTS = 2;

function hasAiGeneratedKeywordMatch(searchText) {
	for (const pattern of PRESET_KEYWORDS.ai) {
		if (pattern.test(searchText)) return true;
	}

	return PRESET_KEYWORDS.aiUrlOrLabel.test(searchText);
}

const FILTER_PRESETS = [
	{
		id: "no-ai",
		type: "exclude",
		matches: (metrics) => hasAiGeneratedKeywordMatch(metrics.searchText),
	},
	{
		id: "rated-4plus-3-reviews",
		type: "include",
		matches: (metrics) =>
			metrics.reviewCount !== null &&
			metrics.reviewCount >= 3 &&
			metrics.rating !== null &&
			metrics.rating >= 4,
	},
];

function sanitizeList(values) {
	if (!Array.isArray(values)) return [];
	const seen = new Set();
	const sanitized = [];

	for (const value of values) {
		const normalized = String(value || "")
			.trim()
			.toLowerCase();
		if (!normalized || seen.has(normalized)) continue;

		seen.add(normalized);
		sanitized.push(normalized);
	}

	return sanitized;
}

function areListsEqual(left, right) {
	if (left.length !== right.length) return false;

	for (let index = 0; index < left.length; index += 1) {
		if (left[index] !== right[index]) return false;
	}

	return true;
}

function setHiddenSellers(values) {
	const sanitized = sanitizeList(values);
	config.hiddenSellers = sanitized;
	hiddenSellerSet = new Set(sanitized);
	return sanitized;
}

function markFilterSettingsChanged() {
	filterSettingsVersion += 1;
}

function sanitizePresetState(rawState) {
	const defaults = {
		"no-ai": false,
		"rated-4plus-3-reviews": false,
	};

	if (!rawState || typeof rawState !== "object" || Array.isArray(rawState)) {
		return defaults;
	}

	for (const preset of FILTER_PRESETS) {
		defaults[preset.id] = Boolean(rawState[preset.id]);
	}

	return defaults;
}

function arePresetStatesEqual(left, right) {
	for (const preset of FILTER_PRESETS) {
		if (Boolean(left?.[preset.id]) !== Boolean(right?.[preset.id])) {
			return false;
		}
	}

	return true;
}

function hasActivePreset(id) {
	return Boolean(config.activeFilterPresets?.[id]);
}

function hasAnyActivePreset() {
	return hasActiveFilterPresets;
}

function refreshActiveFilterPresetCache() {
	activeIncludeFilterPresets = [];
	activeExcludeFilterPresets = [];

	for (const preset of FILTER_PRESETS) {
		if (!hasActivePreset(preset.id)) continue;

		if (preset.type === "include") {
			activeIncludeFilterPresets.push(preset);
		} else if (preset.type === "exclude") {
			activeExcludeFilterPresets.push(preset);
		}
	}
	hasActiveFilterPresets =
		activeIncludeFilterPresets.length > 0 ||
		activeExcludeFilterPresets.length > 0;
}

function isHiddenByFilterPresets(metrics) {
	for (const preset of activeExcludeFilterPresets) {
		if (preset.matches(metrics)) return true;
	}

	if (activeIncludeFilterPresets.length === 0) return false;

	for (const preset of activeIncludeFilterPresets) {
		const result = preset.matches(metrics);
		if (!result) return true;
	}

	return false;
}

refreshActiveFilterPresetCache();

function hasSavedItemMarker(card) {
	const icons = card.getElementsByClassName?.(SAVED_ITEM_ICON_CLASS);
	if (icons?.length) {
		for (const icon of icons) {
			let current = icon.parentElement;
			while (current) {
				if (current.classList?.contains(SAVED_ITEM_SUCCESS_CLASS)) return true;
				if (current === card) break;
				current = current.parentElement;
			}
		}
	}

	return /\bsaved\s+in\s+my\s+library\b/i.test(card.textContent || "");
}

function getCardContentVersion(card) {
	return CARD_CONTENT_VERSION_CACHE.get(card) || 0;
}

function markCardContentChanged(card) {
	if (!card) return;

	cardContentVersion += 1;
	CARD_CONTENT_VERSION_CACHE.set(card, cardContentVersion);
	CARD_METRICS_CACHE.delete(card);
	CARD_SELLER_INFO_CACHE.delete(card);
	CARD_FILTER_RESULT_CACHE.delete(card);
	CARD_DOM_SIGNATURE_CACHE.delete(card);
}

function getCardDomState(
	card,
	filterContextSignature,
	includeListingMetadata,
	includeSavedState = true,
	knownHref = null,
) {
	const contentVersion = getCardContentVersion(card);
	if (!includeListingMetadata && !includeSavedState) {
		return {
			signature: `${filterContextSignature}|saved-ignored|${contentVersion}`,
			isSaved: false,
		};
	}

	const cached = CARD_DOM_SIGNATURE_CACHE.get(card);
	if (
		cached?.contentVersion === contentVersion &&
		(!includeListingMetadata || cached.hasListingMetadata) &&
		(!includeSavedState || cached.hasSavedState)
	) {
		return {
			signature: `${filterContextSignature}|${cached.signature}`,
			isSaved: cached.isSaved,
		};
	}

	const isSaved = includeSavedState ? hasSavedItemMarker(card) : false;
	const savedSignature = includeSavedState
		? isSaved
			? "saved"
			: "not-saved"
		: "saved-ignored";
	let signature = `${savedSignature}|${contentVersion}`;

	if (includeListingMetadata) {
		const listingHref =
			knownHref === null ? getFirstProductOrListingHref(card) : knownHref;
		const sellerInfo = getCardSellerInfo(card);
		signature = `${listingHref}|${sellerInfo.sellerName}|${signature}`;
	}

	CARD_DOM_SIGNATURE_CACHE.set(card, {
		contentVersion,
		signature,
		isSaved,
		hasListingMetadata: includeListingMetadata,
		hasSavedState: includeSavedState,
	});

	return {
		signature: `${filterContextSignature}|${signature}`,
		isSaved,
	};
}

function getCachedCardFilterResult(
	card,
	cardDomSignature,
	needsFullMetrics = false,
) {
	const cached = CARD_FILTER_RESULT_CACHE.get(card);
	if (!cached) return null;
	if (cached.version !== filterSettingsVersion) return null;
	if (cached.signature !== cardDomSignature) return null;
	if (needsFullMetrics && !cached.hasFullMetrics) return null;
	return cached;
}

function setCachedCardFilterResult(
	card,
	cardDomSignature,
	metrics,
	shouldHide,
	hasFullMetrics,
) {
	CARD_FILTER_RESULT_CACHE.set(card, {
		version: filterSettingsVersion,
		signature: cardDomSignature,
		metrics,
		shouldHide,
		hasFullMetrics,
	});
}

let lastProcessedProductIdentity = null;
let lastExpandedProductPath = null;
let productPageLifecycleVersion = 0;
let productRequestInFlightIdentity = null;
let productRequestInFlightVersion = 0;
let renderedProductIdentity = null;

function isCurrentProductLifecycle(pathname, productIdentity, lifecycleVersion) {
	return (
		config.extensionActive &&
		productPageLifecycleVersion === lifecycleVersion &&
		window.location.pathname === pathname &&
		lastProcessedProductIdentity === productIdentity
	);
}

async function processProductPage(pathname) {
	if (lastExpandedProductPath !== pathname) {
		const buttons = Array.from(document.querySelectorAll("button"));
		const showMoreBtn = buttons.find((b) =>
			b.textContent.toLowerCase().includes("show more"),
		);
		if (showMoreBtn) {
			showMoreBtn.click();
			lastExpandedProductPath = pathname;
		}
	}

	const sellerLink = document.querySelector('a[href^="/sellers/"]');
	if (!sellerLink) return;

	const sellerHref = sellerLink.getAttribute("href");
	const sellerName =
		getSellerName(null, sellerLink) || getSellerNameFromSellerHref(sellerHref);
	if (!sellerName) return;
	const productIdentity = `${pathname}|${sellerHref}`;

	const heading = document.querySelector("h1");
	if (!heading) return;

	let productWidgetContainer = document.getElementById("better-fab-product-widget");
	if (!productWidgetContainer) {
		productWidgetContainer = document.createElement("div");
		productWidgetContainer.id = "better-fab-product-widget";
		productWidgetContainer.style.fontSize = "14px";
		productWidgetContainer.style.fontWeight = "normal";
		productWidgetContainer.style.lineHeight = "normal";
		productWidgetContainer.style.marginTop = "8px";
		productWidgetContainer.style.marginBottom = "8px";
		
		const targetBlock = heading.closest(".fabkit-Stack-root") || heading.parentElement;
		if (targetBlock && targetBlock.parentElement) {
			targetBlock.parentElement.insertBefore(productWidgetContainer, targetBlock.nextSibling);
			needsExtensionCleanup = true;
		}
	}

	let btnContainer = productWidgetContainer.querySelector(
		".better-fab-product-ignore-btn",
	);
	if (!btnContainer) {
		btnContainer = document.createElement("div");
		btnContainer.className = "better-fab-product-ignore-btn";
		btnContainer.style.marginBottom = "16px";
		productWidgetContainer.appendChild(btnContainer);
	}
	let btn = btnContainer.querySelector(SELLER_PAGE_BUTTON_SELECTOR);
	if (!btn) {
		btn = createSellerProfileButton();
		btnContainer.appendChild(btn);
	}
	btn.dataset.seller = sellerName;
	updateSellerPageIgnoreButton(btn, sellerName);

	const existingProfile = document.getElementById(
		"better-fab-product-profile",
	);
	const hasRenderedProfile =
		renderedProductIdentity === productIdentity &&
		existingProfile?.parentElement === productWidgetContainer;
	const hasInFlightRequest =
		productRequestInFlightIdentity === productIdentity &&
		productRequestInFlightVersion !== 0;
	if (
		lastProcessedProductIdentity === productIdentity &&
		(hasRenderedProfile || hasInFlightRequest)
	) {
		return;
	}
	document.getElementById("better-fab-product-profile")?.remove();
	renderedProductIdentity = null;
	lastProcessedProductIdentity = productIdentity;
	productPageLifecycleVersion += 1;
	const lifecycleVersion = productPageLifecycleVersion;
	productRequestInFlightIdentity = productIdentity;
	productRequestInFlightVersion = lifecycleVersion;

	try {
		let response = null;
		let fetchError = null;
		for (let attempt = 0; attempt < PRODUCT_SELLER_FETCH_ATTEMPTS; attempt += 1) {
			if (!isCurrentProductLifecycle(pathname, productIdentity, lifecycleVersion)) {
				return;
			}

			try {
				const candidateResponse = await fetch(sellerHref);
				if (candidateResponse.ok) {
					response = candidateResponse;
					break;
				}
			} catch (error) {
				fetchError = error;
			}
		}

		if (!response) {
			if (
				productPageLifecycleVersion === lifecycleVersion &&
				lastProcessedProductIdentity === productIdentity
			) {
				lastProcessedProductIdentity = null;
			}
			if (fetchError) {
				console.error("Failed to fetch seller metrics for product page", fetchError);
			}
			return;
		}
		const html = await response.text();
		if (!isCurrentProductLifecycle(pathname, productIdentity, lifecycleVersion)) {
			return;
		}

		const parser = new DOMParser();
		const doc = parser.parseFromString(html, "text/html");

		const listingNodes = getListingScanNodes(doc);
		const entries = [];
		const processedCards = new Set();
		for (const item of listingNodes) {
			const card = getCardFromListingNode(item);
			if (!card || processedCards.has(card)) continue;
			processedCards.add(card);
			entries.push({ card, metrics: getCardMetrics(card) });
		}

		const sellerProfile = SellerProfileModule.analyze({
			entries,
			sellerName,
			source: createFabDomAdapter(doc, sellerHref),
		});
		const profile = createSellerProfile();
		
		profile.style.marginTop = "16px";
		profile.style.marginBottom = "16px";
		profile.querySelector(SELLER_PAGE_BUTTON_SELECTOR)?.remove();

		updateSellerProfileContent(profile, sellerProfile.presentation);

		document.getElementById("better-fab-product-profile")?.remove();
		
		profile.id = "better-fab-product-profile";
		const currentProductWidgetContainer = document.getElementById(
			"better-fab-product-widget",
		);
		if (currentProductWidgetContainer?.isConnected) {
			currentProductWidgetContainer.appendChild(profile);
			renderedProductIdentity = productIdentity;
		} else if (isCurrentProductLifecycle(pathname, productIdentity, lifecycleVersion)) {
			lastProcessedProductIdentity = null;
		}
	} catch (e) {
		if (
			productPageLifecycleVersion === lifecycleVersion &&
			lastProcessedProductIdentity === productIdentity
		) {
			lastProcessedProductIdentity = null;
		}
		console.error("Failed to fetch seller metrics for product page", e);
	} finally {
		if (productRequestInFlightVersion === lifecycleVersion) {
			productRequestInFlightIdentity = null;
			productRequestInFlightVersion = 0;
		}
	}
}

function getSellerLink(card) {
	const links = card.getElementsByTagName?.("a");
	if (!links) return null;

	for (const link of links) {
		if (getSellerNameFromSellerHref(link.getAttribute("href"))) return link;
	}

	return null;
}

function getSellerName(card, sellerLink = getSellerLink(card)) {
	if (!sellerLink) return "";
	return (
		sellerLink.textContent.trim().toLowerCase() ||
		getSellerNameFromSellerHref(sellerLink.getAttribute("href"))
	);
}

function getCardSellerInfo(card) {
	const contentVersion = getCardContentVersion(card);
	const cached = CARD_SELLER_INFO_CACHE.get(card);
	if (cached?.contentVersion === contentVersion) return cached.info;

	const sellerLink = getSellerLink(card);
	const info = {
		sellerIdentity: getSellerNameFromSellerHref(
			sellerLink?.getAttribute("href"),
		),
		sellerLink,
		sellerName: getSellerName(card, sellerLink),
	};
	CARD_SELLER_INFO_CACHE.set(card, { contentVersion, info });
	return info;
}

function getSellerNameFromPathname(pathname) {
	return FabDomModule.getSellerNameFromPathname(pathname);
}

function getSellerNameFromSellerHref(href) {
	return FabDomModule.getSellerNameFromHref(href);
}

function getCardText(card, initialText = null) {
	let text = initialText === null ? card.textContent || "" : initialText;

	const attrElements = card.querySelectorAll(CARD_TEXT_ATTRIBUTE_SELECTOR);
	if (attrElements.length === 0) return text.toLowerCase();
	const hasIgnoreSellerButton =
		card.getElementsByClassName?.(IGNORE_SELLER_BUTTON_CLASS).length > 0;

	for (const element of attrElements) {
		if (hasIgnoreSellerButton && element.closest(IGNORE_SELLER_BUTTON_SELECTOR))
			continue;

		for (const attr of CARD_TEXT_ATTRIBUTES) {
			const value = element.getAttribute(attr);
			if (value) text += ` ${value}`;
		}
	}

	return text.toLowerCase();
}

function parseCountToken(value) {
	const raw = String(value || "").trim();
	const isGroupedThousands = /^\d{1,3}(?:[.,]\d{3})+$/.test(raw);
	const normalized = isGroupedThousands
		? raw.replace(/[.,]/g, "")
		: raw.replace(/,/g, "");
	const multiplier = /[kKmM]$/.test(normalized)
		? /[kK]$/.test(normalized)
			? 1000
			: 1000000
		: 1;
	const parsed = Number.parseFloat(normalized);
	const total = parsed * multiplier;
	return Number.isNaN(total) ? null : total;
}

function parseFabRatingCount(value) {
	const match = String(value || "").match(FAB_RATING_COUNT_PATTERN);
	if (!match) return null;

	const rating = Number.parseFloat(match[1]);
	const reviewCount = parseCountToken(match[2]);
	if (Number.isNaN(rating) || reviewCount === null) return null;

	return {
		rating,
		reviewCount,
	};
}

function parseReviewCount(value, fabRatingCount = parseFabRatingCount(value)) {
	if (fabRatingCount) return fabRatingCount.reviewCount;

	for (const pattern of REVIEW_COUNT_PATTERNS) {
		const match = value.match(pattern);
		if (match) return parseCountToken(match[1]);
	}

	return null;
}

function parseRating(value, fabRatingCount = parseFabRatingCount(value)) {
	if (fabRatingCount) return fabRatingCount.rating;

	for (const pattern of RATING_PATTERNS) {
		const match = value.match(pattern);
		if (!match) continue;
		const parsed = Number.parseFloat(match[1]);
		if (!Number.isNaN(parsed)) return parsed;
	}

	return null;
}

function isProductOrListingLinkElement(node) {
	const root = node?.ownerDocument || document;
	return createFabDomAdapter(root).isProductOrListingLink(node);
}

function getFirstProductOrListingHref(node) {
	const root = node?.ownerDocument || document;
	return createFabDomAdapter(root).getFirstListingHref(node);
}

function getProductOrListingLinks(root = document) {
	return createFabDomAdapter(root).getProductOrListingLinks();
}

function getListingDescendantNodes(root, limit = Number.POSITIVE_INFINITY) {
	return createFabDomAdapter(root).getListingDescendants(root, limit);
}

function addListingDescendantCards(root, changedCards) {
	return createFabDomAdapter(root).addListingDescendantCards(
		root,
		changedCards,
	);
}

function isListingNodeElement(node) {
	const root = node?.ownerDocument || document;
	return createFabDomAdapter(root).isListingNode(node);
}

function getCardFromListingNode(listingNode) {
	const root = listingNode?.ownerDocument || document;
	return createFabDomAdapter(root).getCard(listingNode);
}

function getCardMetricsSignature(card, knownHref = null) {
	const contentVersion = getCardContentVersion(card);
	const href =
		knownHref === null ? getFirstProductOrListingHref(card) : knownHref;

	return `${contentVersion}\u001f${href}`;
}

function getCardMetrics(card, knownHref = null) {
	const signature = getCardMetricsSignature(card, knownHref);
	const cached = CARD_METRICS_CACHE.get(card);
	if (cached?.signature === signature) return cached.metrics;

	const rawText = card.innerText || card.textContent || "";
	const cardText = getCardText(card, rawText);
	const fabRatingCount = parseFabRatingCount(cardText);

	const sellerInfo = getCardSellerInfo(card);

	const metrics = {
		...sellerInfo,
		reviewCount: parseReviewCount(cardText, fabRatingCount),
		rating: parseRating(cardText, fabRatingCount),
		searchText: cardText,
	};
	CARD_METRICS_CACHE.set(card, { signature, metrics });

	return metrics;
}

function normalizeSortText(value) {
	return String(value || "")
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim();
}

function getSortModeFromControl(control) {
	if (!control) return "";

	if (control.tagName === "SELECT") {
		const selected = control.options?.[control.selectedIndex];
		return normalizeSortText(
			`${control.value || ""} ${selected ? selected.textContent || "" : ""}`,
		);
	}

	const selectedOption = control.querySelector('[aria-selected="true"]');
	if (selectedOption) {
		return normalizeSortText(
			`${selectedOption.textContent || ""} ${selectedOption.value || ""} ${
				selectedOption.getAttribute("aria-label") || ""
			}`,
		);
	}

	return normalizeSortText(
		`${control.textContent || ""} ${control.getAttribute("aria-label") || ""} ${
			control.getAttribute("title") || ""
		}`,
	);
}

function getConfiguredSortMode() {
	if (!config.starSortModeSelector) return "";
	try {
		const control = document.querySelector(config.starSortModeSelector);
		return getSortModeFromControl(control);
	} catch (err) {
		return "";
	}
}

function isMinimumReviewsFilterTriggered(metrics) {
	if (!config.minimumReviewCount || config.minimumReviewCount <= 0)
		return false;
	if (metrics.reviewCount === null) return true;
	return metrics.reviewCount < config.minimumReviewCount;
}

function hasHiddenKeywordMatch(metrics) {
	if (!config.hiddenKeywords.length) return false;

	for (const keyword of config.hiddenKeywords) {
		if (metrics.searchText.includes(keyword)) return true;
	}

	return false;
}

function setTextContent(element, value) {
	if (element && element.textContent !== value) element.textContent = value;
}

function getFirstElementByClass(root, className) {
	return root.getElementsByClassName?.(className)?.[0] || null;
}

function closestElementByClass(element, className) {
	let current = element;
	while (current) {
		if (current.classList?.contains(className)) return current;
		current = current.parentElement;
	}

	return null;
}

function closestBetterFabManagedElement(element) {
	let current = element;
	while (current) {
		const classList = current.classList;
		if (
			classList?.contains(IGNORE_SELLER_BUTTON_CLASS) ||
			classList?.contains(SELLER_PAGE_BUTTON_CLASS) ||
			classList?.contains(SELLER_PROFILE_CLASS) ||
			classList?.contains(SELLER_ROW_CLASS)
		) {
			return current;
		}

		current = current.parentElement;
	}

	return null;
}

async function addSellerToIgnoreList(sellerName) {
	const normalizedSeller = String(sellerName || "")
		.trim()
		.toLowerCase();
	if (!normalizedSeller) return;

	const currentData = await chrome.storage.local.get("hiddenSellers");
	const nextHiddenSellers = setHiddenSellers([
		...(currentData.hiddenSellers || []),
		normalizedSeller,
	]);

	markFilterSettingsChanged();
	await chrome.storage.local.set({ hiddenSellers: nextHiddenSellers });
	ProcessingCoordinator.request({ cause: "seller-ignore" });
}

function updateSellerPageIgnoreButton(button, sellerName) {
	const isIgnored = hiddenSellerSet.has(sellerName);
	const label = isIgnored
		? "Seller removed from listings"
		: "Remove seller from listings";

	if (button.disabled !== isIgnored) button.disabled = isIgnored;
	setTextContent(button, label);
}

function getSellerItemsContainer(entries) {
	const firstCard = entries[0]?.card;
	if (!firstCard?.parentElement) return null;
	return firstCard.parentElement;
}

function createSellerProfileButton() {
	const button = document.createElement("button");
	button.type = "button";
	button.className = SELLER_PAGE_BUTTON_CLASS;
	button.addEventListener("click", async (event) => {
		event.preventDefault();
		event.stopPropagation();
		await addSellerToIgnoreList(button.dataset.seller);
	});
	return button;
}

function createSellerProfile() {
	const profile = document.createElement("section");
	profile.className = SELLER_PROFILE_CLASS;

	const details = document.createElement("div");
	details.className = "better-fab-seller-profile-details";

	const title = document.createElement("div");
	title.className = "better-fab-seller-profile-title";
	title.textContent = "Seller Profile";

	const metric = document.createElement("div");
	metric.className = "better-fab-seller-profile-metric";

	const label = document.createElement("span");
	label.textContent = "Average stars";

	const average = document.createElement("strong");
	average.className = SELLER_PROFILE_AVERAGE_CLASS;

	const count = document.createElement("span");
	count.className = SELLER_PROFILE_COUNT_CLASS;

	metric.append(label, average, count);
	details.append(title, metric);
	profile.append(details, createSellerProfileButton());

	return profile;
}

function getSellerProfileElement(allowQuery = true) {
	if (sellerProfileElement?.isConnected) return sellerProfileElement;
	sellerProfileElement = null;
	if (!allowQuery) return null;

	sellerProfileElement = document.querySelector(SELLER_PROFILE_SELECTOR);
	return sellerProfileElement;
}

function removeSellerProfile(allowQuery = true) {
	const existingProfile = getSellerProfileElement(allowQuery);
	existingProfile?.remove();
	if (existingProfile) sellerProfileElement = null;
}

function updateSellerProfileContent(profile, presentation) {
	const averageElement = profile.querySelector(SELLER_PROFILE_AVERAGE_SELECTOR);
	const countElement = profile.querySelector(SELLER_PROFILE_COUNT_SELECTOR);

	setTextContent(averageElement, presentation.averageText);
	setTextContent(countElement, presentation.countText);
}

function ensureSellerProfile(isSellerPage, entries, allowProfileQuery = true) {
	const existingProfile = getSellerProfileElement(allowProfileQuery);

	if (!isSellerPage) {
		removeSellerProfile(allowProfileQuery);
		return;
	}

	const sellerName = getSellerNameFromPathname(window.location.pathname);
	if (!sellerName) {
		removeSellerProfile(allowProfileQuery);
		return;
	}

	const profile = existingProfile || createSellerProfile();
	if (!existingProfile) needsExtensionCleanup = true;
	sellerProfileElement = profile;
	
	const button = profile.querySelector(SELLER_PAGE_BUTTON_SELECTOR);
	const sellerProfile = SellerProfileModule.analyze({
		entries,
		sellerName,
		source: createFabDomAdapter(document, window.location.pathname),
	});

	button.dataset.seller = sellerName;
	button.hidden = !config.showHideSellerButtons;
	updateSellerPageIgnoreButton(button, sellerName);

	updateSellerProfileContent(profile, sellerProfile.presentation);

	const targetDiv = document.querySelector(".fabkit-Stack-root.DFhlZJF3");
	if (targetDiv && targetDiv.parentElement) {
		if (profile.previousElementSibling !== targetDiv) {
			targetDiv.parentElement.insertBefore(profile, targetDiv.nextSibling);
		}
		return;
	}

	const sellerItemsContainer = getSellerItemsContainer(sellerProfile.entries);
	if (sellerItemsContainer?.parentElement) {
		if (profile.nextElementSibling !== sellerItemsContainer) {
			sellerItemsContainer.parentElement.insertBefore(
				profile,
				sellerItemsContainer,
			);
		}
		return;
	}

	if (!profile.isConnected) {
		const heading = document.querySelector("h1");
		if (heading) {
			const targetBlock = heading.closest(".fabkit-Stack-root") || heading.parentElement;
			if (targetBlock && targetBlock.parentElement) {
				targetBlock.parentElement.insertBefore(profile, targetBlock.nextSibling);
			}
		}
	}
}

function removeIgnoreSellerButton(card) {
	if (!card.classList.contains(IGNORE_SELLER_CARD_CLASS)) return;

	card.classList.remove(IGNORE_SELLER_CARD_CLASS);
	getFirstElementByClass(card, IGNORE_SELLER_BUTTON_CLASS)?.remove();

	const sellerRow = getFirstElementByClass(card, SELLER_ROW_CLASS);
	if (!sellerRow || sellerRow.tagName !== "SPAN" || !sellerRow.parentElement)
		return;

	const parent = sellerRow.parentElement;
	while (sellerRow.firstChild) {
		parent.insertBefore(sellerRow.firstChild, sellerRow);
	}
	sellerRow.remove();
}

function ensureIgnoreSellerButton(
	card,
	sellerName,
	sellerLink = getSellerLink(card),
) {
	const normalizedSeller = String(sellerName || "")
		.trim()
		.toLowerCase();
	const existingButton = getFirstElementByClass(
		card,
		IGNORE_SELLER_BUTTON_CLASS,
	);

	if (!normalizedSeller || !sellerLink) {
		existingButton?.remove();
		if (card.classList.contains(IGNORE_SELLER_CARD_CLASS)) {
			card.classList.remove(IGNORE_SELLER_CARD_CLASS);
		}
		return;
	}

	const currentSellerRow = closestElementByClass(sellerLink, SELLER_ROW_CLASS);
	if (
		existingButton?.dataset.seller === normalizedSeller &&
		existingButton.nextElementSibling === sellerLink &&
		existingButton.parentElement === currentSellerRow &&
		card.classList.contains(IGNORE_SELLER_CARD_CLASS)
	) {
		return;
	}

	needsExtensionCleanup = true;

	if (!card.classList.contains(IGNORE_SELLER_CARD_CLASS)) {
		card.classList.add(IGNORE_SELLER_CARD_CLASS);
	}
	const legacyRowParent = sellerLink.parentElement;
	if (
		legacyRowParent?.classList.contains(SELLER_ROW_CLASS) &&
		legacyRowParent.tagName !== "SPAN"
	) {
		legacyRowParent.classList.remove(SELLER_ROW_CLASS);
	}

	let sellerRow = currentSellerRow;
	if (!sellerRow) {
		sellerRow = document.createElement("span");
		sellerRow.className = SELLER_ROW_CLASS;
		sellerLink.parentElement?.insertBefore(sellerRow, sellerLink);
		sellerRow.appendChild(sellerLink);
	}

	const button = existingButton || document.createElement("button");
	if (!existingButton) {
		button.type = "button";
		button.className = IGNORE_SELLER_BUTTON_CLASS;
		button.addEventListener("click", async (event) => {
			event.preventDefault();
			event.stopPropagation();
			await addSellerToIgnoreList(button.dataset.seller);
		});
	}

	if (button.parentElement !== sellerRow) {
		sellerRow.insertBefore(button, sellerLink);
	} else if (button.nextElementSibling !== sellerLink) {
		sellerRow.insertBefore(button, sellerLink);
	}

	button.dataset.seller = normalizedSeller;
	button.title = `Hide seller: ${normalizedSeller}`;
	button.setAttribute("aria-label", `Hide seller: ${normalizedSeller}`);
}

function isConfiguredQueryMatchActive(
	exactModeMatch = normalizeSortText(config.starSortModeMatch || ""),
) {
	const search = window.location.search;
	const signature = `${search}|${exactModeMatch}`;
	if (configuredQueryMatchCache.signature === signature) {
		return configuredQueryMatchCache.value;
	}

	if (!exactModeMatch.includes("=")) {
		configuredQueryMatchCache = { signature, value: null };
		return null;
	}

	const currentParams = new URLSearchParams(search);
	try {
		const configuredParams = new URLSearchParams(exactModeMatch);
		for (const [key, value] of configuredParams.entries()) {
			const currentValue = currentParams.get(key);
			if (
				currentValue === null ||
				normalizeSortText(currentValue) !== normalizeSortText(value)
			) {
				configuredQueryMatchCache = { signature, value: false };
				return false;
			}
		}
		configuredQueryMatchCache = { signature, value: true };
		return true;
	} catch (err) {
		configuredQueryMatchCache = { signature, value: false };
		return false;
	}
}

function isKnownStarSortQueryMode() {
	const search = window.location.search;
	if (knownStarSortQueryModeCache.search === search) {
		return knownStarSortQueryModeCache.value;
	}

	const queryParams = new URLSearchParams(search);

	for (const [key, value] of queryParams.entries()) {
		if (!STAR_SORT_QUERY_KEY_SET.has(key.toLowerCase())) continue;
		if (normalizeSortText(value).includes(STAR_SORT_QUERY_FRAGMENT)) {
			knownStarSortQueryModeCache = { search, value: true };
			return true;
		}
	}

	knownStarSortQueryModeCache = { search, value: false };
	return false;
}

function isStarSortActive() {
	const explicitMatchConfigured = normalizeSortText(
		config.starSortModeMatch || "",
	);
	const isKnownQueryMode = isKnownStarSortQueryMode();
	if (isKnownQueryMode) return true;

	if (explicitMatchConfigured && explicitMatchConfigured.includes("=")) {
		return isConfiguredQueryMatchActive(explicitMatchConfigured) === true;
	}

	if (config.starSortModeSelector) {
		const configuredSortMode = getConfiguredSortMode();
		if (!configuredSortMode) return false;
		if (!explicitMatchConfigured) {
			return STAR_SORT_INDICATOR.test(configuredSortMode);
		}

		return configuredSortMode.includes(explicitMatchConfigured);
	}

	return false;
}

function compareCardMetrics(a, b) {
	const ratingDiff = b.metrics.rating - a.metrics.rating;
	if (ratingDiff !== 0) return ratingDiff;

	if (a.metrics.rating === null && b.metrics.rating === null)
		return a.index - b.index;

	const aReviews = a.metrics.reviewCount === null ? -1 : a.metrics.reviewCount;
	const bReviews = b.metrics.reviewCount === null ? -1 : b.metrics.reviewCount;
	if (bReviews !== aReviews) return bReviews - aReviews;

	return a.index - b.index;
}

function applyStarReviewSort(entries) {
	const entriesByParent = new Map();

	for (const entry of entries) {
		const parent = entry.card.parentElement;
		if (!parent) continue;
		if (!entriesByParent.has(parent)) entriesByParent.set(parent, []);
		entriesByParent.get(parent).push(entry);
	}

	for (const [parent, children] of entriesByParent) {
		if (children.length < 2) continue;

		let isAlreadySorted = true;
		for (let i = 1; i < children.length; i += 1) {
			if (compareCardMetrics(children[i - 1], children[i]) > 0) {
				isAlreadySorted = false;
				break;
			}
		}
		if (isAlreadySorted) continue;

		const sorted = [...children].sort(compareCardMetrics);

		for (const entry of sorted) {
			parent.appendChild(entry.card);
		}
	}
}

function disableExtensionManipulations(listingNodes) {
	const processedCards = new Set();

	for (const item of listingNodes) {
		const card = getCardFromListingNode(item);
		if (!card) continue;
		if (processedCards.has(card)) continue;
		processedCards.add(card);

		setCardHiddenState(card, false);
		removeIgnoreSellerButton(card);
	}

	removeSellerProfile();
	document.getElementById("better-fab-product-widget")?.remove();
	productPageLifecycleVersion += 1;
	lastProcessedProductIdentity = null;
	lastExpandedProductPath = null;
	productRequestInFlightIdentity = null;
	productRequestInFlightVersion = 0;
	renderedProductIdentity = null;
	needsExtensionCleanup = false;
}

function getListingScanNodes(root = document) {
	return createFabDomAdapter(root).getListingNodes();
}

function cleanupExtensionManipulations(listingSetSignature = null) {
	if (!needsExtensionCleanup) {
		if (listingSetSignature) markListingSetProcessed(listingSetSignature);
		return;
	}

	const listingNodes = getListingScanNodes();
	const currentListingSetSignature =
		listingSetSignature || getListingSetSignatureFromNodes(listingNodes);
	disableExtensionManipulations(listingNodes);
	markListingSetProcessed(currentListingSetSignature);
}

function setCardHiddenState(card, shouldHide) {
	if (shouldHide) {
		if (!card.classList.contains("fab-hidden-item")) {
			card.classList.add("fab-hidden-item");
			needsExtensionCleanup = true;
		}
		return;
	}

	if (card.classList.contains("fab-hidden-item")) {
		card.classList.remove("fab-hidden-item");
	}
}

function buildListingSetSignature(linkCount, firstHref, lastHref) {
	return `${window.location.pathname}|${window.location.search}|${linkCount}|${firstHref}|${lastHref}`;
}

function getListingSetSignature() {
	const links = getProductOrListingLinks();

	return buildListingSetSignature(
		links.length,
		links[0]?.getAttribute("href") || "",
		links[links.length - 1]?.getAttribute("href") || "",
	);
}

function getListingSetSignatureFromNodes(listingNodes) {
	const firstNode = listingNodes[0];
	if (isProductOrListingLinkElement(firstNode)) {
		const lastNode = listingNodes[listingNodes.length - 1];
		return buildListingSetSignature(
			listingNodes.length,
			firstNode.getAttribute("href") || "",
			lastNode?.getAttribute("href") || "",
		);
	}

	let linkCount = 0;
	let firstHref = "";
	let lastHref = "";

	for (const node of listingNodes) {
		if (!isProductOrListingLinkElement(node)) continue;

		const href = node.getAttribute("href") || "";
		if (linkCount === 0) firstHref = href;
		lastHref = href;
		linkCount += 1;
	}

	return buildListingSetSignature(linkCount, firstHref, lastHref);
}

function markListingSetProcessed(signature) {
	lastProcessedListingSignature = signature;
	lastProcessItemsCompletedAt = Date.now();
}

function getCardProcessingState(pathname = window.location.pathname) {
	const isHomePage = pathname === "/";
	const isLimitedTimeFreePage = pathname.startsWith("/limited-time-free");
	const isLibraryPage = pathname.startsWith("/library");
	const isSellerPage = pathname.startsWith("/sellers/");
	const isProductPage =
		pathname.startsWith("/listings/") || pathname.startsWith("/products/");
	const shouldBypassFilters = isHomePage || isLimitedTimeFreePage;
	const shouldApplyStarSort =
		config.sortStarsByReviewCount && isStarSortActive();
	const hasActivePresets = hasAnyActivePreset();
	let hasWork = false;

	if (
		isSellerPage ||
		isProductPage ||
		config.showHideSellerButtons ||
		shouldApplyStarSort
	) {
		hasWork = true;
	} else if (!shouldBypassFilters) {
		const shouldRunSellerFilter =
			!isLibraryPage || config.applySellerFilterInLibrary;
		hasWork =
			config.filterActive ||
			config.minimumReviewCount > 0 ||
			hasActivePresets ||
			(shouldRunSellerFilter &&
				(hiddenSellerSet.size > 0 || config.hiddenKeywords.length > 0));
	}

	return {
		pathname,
		isHomePage,
		isLimitedTimeFreePage,
		isLibraryPage,
		isSellerPage,
		isProductPage,
		shouldBypassFilters,
		hasWork,
		shouldApplyStarSort,
		hasActivePresets,
	};
}

function hasPotentialStarSortWork() {
	if (!config.sortStarsByReviewCount) return false;

	if (config.starSortModeSelector) return true;

	const signature = `${window.location.search}|${config.starSortModeMatch}`;
	if (potentialStarSortWorkCache.signature === signature) {
		return potentialStarSortWorkCache.value;
	}

	const explicitModeMatch = normalizeSortText(config.starSortModeMatch || "");
	const isKnownQueryMode = isKnownStarSortQueryMode();
	const value =
		isKnownQueryMode ||
		(explicitModeMatch.includes("=") &&
			isConfiguredQueryMatchActive(explicitModeMatch) === true);

	potentialStarSortWorkCache = { signature, value };
	return value;
}

function hasPotentialCardProcessingWork(
	pathname = window.location.pathname,
	potentialStarSortWork = null,
	isSellerPage = pathname.startsWith("/sellers/"),
) {
	const showHideSellerButtons = config.showHideSellerButtons;
	const resolvedPotentialStarSortWork =
		potentialStarSortWork ??
		(isSellerPage || showHideSellerButtons
			? false
			: hasPotentialStarSortWork());
	const cached = potentialCardProcessingWorkCache;
	if (
		cached.pathname === pathname &&
		cached.filterSettingsVersion === filterSettingsVersion &&
		cached.potentialStarSortWork === resolvedPotentialStarSortWork &&
		cached.isSellerPage === isSellerPage &&
		cached.showHideSellerButtons === showHideSellerButtons
	) {
		return cached.value;
	}

	let value = true;
	const isProductPage =
		pathname.startsWith("/listings/") || pathname.startsWith("/products/");

	if (
		!isSellerPage &&
		!isProductPage &&
		!showHideSellerButtons &&
		!resolvedPotentialStarSortWork
	) {
		const shouldBypassFilters =
			pathname === "/" || pathname.startsWith("/limited-time-free");

		if (shouldBypassFilters) {
			value = false;
		} else if (
			!config.filterActive &&
			config.minimumReviewCount <= 0 &&
			!hasAnyActivePreset()
		) {
			const isLibraryPage = pathname.startsWith("/library");
			const shouldRunSellerFilter =
				!isLibraryPage || config.applySellerFilterInLibrary;
			value =
				shouldRunSellerFilter &&
				(hiddenSellerSet.size > 0 || config.hiddenKeywords.length > 0);
		}
	}

	potentialCardProcessingWorkCache = {
		pathname,
		filterSettingsVersion,
		potentialStarSortWork: resolvedPotentialStarSortWork,
		isSellerPage,
		showHideSellerButtons,
		value,
	};
	return value;
}

function processItems(
	listingSetSignature = null,
	targetCards = null,
	processingState = null,
) {
	const pathname = processingState?.pathname || window.location.pathname;

	if (!config.extensionActive) {
		MassAddSession.stop();
		cleanupExtensionManipulations(listingSetSignature);
		return;
	}

	const cardProcessingState =
		processingState || getCardProcessingState(pathname);
	const isHomePage = cardProcessingState.isHomePage ?? pathname === "/";
	const isLimitedTimeFreePage =
		cardProcessingState.isLimitedTimeFreePage ??
		pathname.startsWith("/limited-time-free");
	const isLibraryPage =
		cardProcessingState.isLibraryPage ?? pathname.startsWith("/library");
	const isSellerPage =
		cardProcessingState.isSellerPage ?? pathname.startsWith("/sellers/");
	const isProductPage =
		cardProcessingState.isProductPage ??
		(pathname.startsWith("/listings/") || pathname.startsWith("/products/"));
	const shouldBypassFilters =
		cardProcessingState.shouldBypassFilters ??
		(isHomePage || isLimitedTimeFreePage);

	if (!cardProcessingState.hasWork) {
		cleanupExtensionManipulations(listingSetSignature);
		return;
	}

	if (isProductPage) {
		void processProductPage(pathname);
	}

	const shouldApplyStarSort = cardProcessingState.shouldApplyStarSort;
	const needsFullCardSet = isSellerPage || shouldApplyStarSort;
	const shouldProcessTargetCards = targetCards?.size > 0 && !needsFullCardSet;
	const listingNodes = shouldProcessTargetCards ? null : getListingScanNodes();
	const currentListingSetSignature =
		listingSetSignature ||
		(shouldProcessTargetCards ? lastProcessedListingSignature : "") ||
		getListingSetSignatureFromNodes(listingNodes || []);
	const shouldCollectEntries = isSellerPage || shouldApplyStarSort;
	const entries = shouldCollectEntries ? [] : null;
	const shouldAllowProfileQuery = !shouldProcessTargetCards;
	const processedCards = shouldProcessTargetCards ? null : new Set();
	const shouldRunPresetFilters =
		!shouldBypassFilters &&
		(cardProcessingState.hasActivePresets ?? hasAnyActivePreset());
	const shouldRunSellerFilter =
		!shouldBypassFilters &&
		!isSellerPage &&
		(!isLibraryPage || config.applySellerFilterInLibrary);
	const shouldRunSavedFilter =
		!shouldBypassFilters &&
		config.filterActive &&
		(!isSellerPage || config.applySavedFilterOnSellerPage);
	const shouldEvaluateHideState =
		!shouldBypassFilters &&
		(shouldRunSavedFilter ||
			(shouldRunSellerFilter &&
				(hiddenSellerSet.size > 0 || config.hiddenKeywords.length > 0)) ||
			config.minimumReviewCount > 0 ||
			shouldRunPresetFilters);
	const needsFullCardMetrics =
		isSellerPage ||
		shouldApplyStarSort ||
		(shouldRunSellerFilter && config.hiddenKeywords.length > 0) ||
		(!shouldBypassFilters && config.minimumReviewCount > 0) ||
		shouldRunPresetFilters;
	const needsCardMetrics =
		isSellerPage ||
		shouldApplyStarSort ||
		config.showHideSellerButtons ||
		(shouldRunSellerFilter &&
			(hiddenSellerSet.size > 0 || config.hiddenKeywords.length > 0)) ||
		(!shouldBypassFilters && config.minimumReviewCount > 0) ||
		shouldRunPresetFilters;
	const filterContextSignature = `${pathname}|${
		shouldBypassFilters ? "bypass" : "filter"
	}|${isLibraryPage ? "library" : "not-library"}|${
		isSellerPage ? "seller" : "not-seller"
	}`;

	const itemsToProcess = shouldProcessTargetCards ? targetCards : listingNodes;
	const shouldUseItemHrefForMetrics =
		!shouldProcessTargetCards &&
		isProductOrListingLinkElement(listingNodes?.[0]);
	let index = shouldCollectEntries ? 0 : null;

	for (const item of itemsToProcess) {
		const card = shouldProcessTargetCards ? item : getCardFromListingNode(item);
		const entryIndex = shouldCollectEntries ? index : 0;
		if (shouldCollectEntries) index += 1;

		if (!card) continue;
		if (shouldProcessTargetCards && !card.isConnected) continue;
		if (getFirstProductOrListingHref(card) === "") continue;
		if (processedCards) {
			if (processedCards.has(card)) continue;
			processedCards.add(card);
		}

		const knownItemHref = shouldUseItemHrefForMetrics
			? item.getAttribute("href") || ""
			: null;
		const cardDomState = shouldEvaluateHideState
			? getCardDomState(
					card,
					filterContextSignature,
					needsFullCardMetrics,
					shouldRunSavedFilter,
					knownItemHref,
				)
			: null;
		const cardDomSignature = cardDomState?.signature || "";
		const cachedFilterResult = shouldEvaluateHideState
			? getCachedCardFilterResult(card, cardDomSignature, needsFullCardMetrics)
			: null;
		const metrics = needsFullCardMetrics
			? cachedFilterResult?.metrics || getCardMetrics(card, knownItemHref)
			: needsCardMetrics
				? cachedFilterResult?.metrics || getCardSellerInfo(card)
				: null;
		let shouldHide = false;

		if (config.showHideSellerButtons) {
			ensureIgnoreSellerButton(card, metrics.sellerName, metrics.sellerLink);
		} else {
			removeIgnoreSellerButton(card);
		}

		if (cachedFilterResult) {
			shouldHide = cachedFilterResult.shouldHide;
			if (shouldCollectEntries) {
				entries.push({ card, metrics, index: entryIndex, shouldHide });
			} else {
				setCardHiddenState(card, shouldHide);
			}
			continue;
		}

		if (shouldEvaluateHideState) {
			if (shouldRunSavedFilter) {
				if (cardDomState.isSaved) shouldHide = true;
			}

			if (!shouldHide && shouldRunSellerFilter && metrics) {
				if (hiddenSellerSet.has(metrics.sellerName)) {
					shouldHide = true;
				} else if (hasHiddenKeywordMatch(metrics)) {
					shouldHide = true;
				}
			}

			if (!shouldHide && isMinimumReviewsFilterTriggered(metrics)) {
				shouldHide = true;
			}

			if (
				!shouldHide &&
				shouldRunPresetFilters &&
				isHiddenByFilterPresets(metrics)
			) {
				shouldHide = true;
			}
		}

		if (shouldEvaluateHideState) {
			setCachedCardFilterResult(
				card,
				cardDomSignature,
				metrics,
				shouldHide,
				needsFullCardMetrics,
			);
		}
		if (shouldCollectEntries) {
			entries.push({ card, metrics, index: entryIndex, shouldHide });
		} else {
			setCardHiddenState(card, shouldHide);
		}
	}

	if (!config.extensionActive) {
		disableExtensionManipulations(listingNodes);
		markListingSetProcessed(currentListingSetSignature);
		return;
	}

	if (shouldCollectEntries) {
		for (const entry of entries) {
			setCardHiddenState(entry.card, entry.shouldHide);
		}
	}

	if (isSellerPage || sellerProfileElement?.isConnected) {
		ensureSellerProfile(
			isSellerPage,
			entries || EMPTY_ENTRIES,
			shouldAllowProfileQuery,
		);
	}

	if (shouldCollectEntries && shouldApplyStarSort) {
		applyStarReviewSort(entries);
	}


	markListingSetProcessed(currentListingSetSignature);
}

const ProcessingCoordinator = ProcessingCoordinatorModule.create({
	cancelIdle:
		typeof window.cancelIdleCallback === "function"
			? window.cancelIdleCallback.bind(window)
			: () => {},
	clearTimer: clearTimeout,
	getLastReconciliation: () => ({
		completedAt: lastProcessItemsCompletedAt,
		signature: lastProcessedListingSignature,
	}),
	getListingSignature: getListingSetSignature,
	getProcessingState: getCardProcessingState,
	hasInitialSignals: hasInitialListingSignals,
	hasPotentialWork: hasPotentialCardProcessingWork,
	isActive: () => config.extensionActive,
	reconcile({ listingSetSignature, targetCards, processingState }) {
		processItems(listingSetSignature, targetCards, processingState);
	},
	requestIdle:
		typeof window.requestIdleCallback === "function"
			? window.requestIdleCallback.bind(window)
			: null,
	setTimer: setTimeout,
});



async function initializeExtension() {
	extensionSettingsLoadAttempts += 1;
	try {
		const data = await chrome.storage.local.get([
			"filterActive",
			"hiddenSellers",
			"applySellerFilterInLibrary",
			"applySavedFilterOnSellerPage",
			"minimumReviewCount",
			"hiddenKeywords",
			"sortStarsByReviewCount",
			"showHideSellerButtons",
			"starSortModeSelector",
			"starSortModeMatch",
			"activeFilterPresets",
			"extensionActive",
		]);

		if (data.filterActive !== undefined)
			config.filterActive = data.filterActive;
		if (data.hiddenSellers !== undefined) setHiddenSellers(data.hiddenSellers);
		if (data.applySellerFilterInLibrary !== undefined)
			config.applySellerFilterInLibrary = data.applySellerFilterInLibrary;
		if (data.applySavedFilterOnSellerPage !== undefined)
			config.applySavedFilterOnSellerPage = data.applySavedFilterOnSellerPage;
		if (data.minimumReviewCount !== undefined)
			config.minimumReviewCount =
				Number.parseInt(data.minimumReviewCount, 10) || 0;
		if (data.hiddenKeywords !== undefined)
			config.hiddenKeywords = sanitizeList(data.hiddenKeywords);
		if (data.sortStarsByReviewCount !== undefined)
			config.sortStarsByReviewCount = data.sortStarsByReviewCount;
		if (data.showHideSellerButtons !== undefined)
			config.showHideSellerButtons = data.showHideSellerButtons !== false;
		if (data.starSortModeSelector !== undefined)
			config.starSortModeSelector = String(data.starSortModeSelector || "");
		if (data.starSortModeMatch !== undefined)
			config.starSortModeMatch = String(data.starSortModeMatch || "")
				.trim()
				.toLowerCase();
		if (data.activeFilterPresets !== undefined) {
			config.activeFilterPresets = sanitizePresetState(
				data.activeFilterPresets,
			);
			refreshActiveFilterPresetCache();
		}
		if (data.extensionActive !== undefined) {
			config.extensionActive = data.extensionActive;
		} else {
			config.extensionActive = data.filterActive !== false;
		}
		markFilterSettingsChanged();
		extensionSettingsLoadAttempts = 0;
		ProcessingCoordinator.request({ cause: "initialization" });
		ProcessingCoordinator.request({ cause: "startup" });
	} catch (err) {
		if (extensionSettingsLoadAttempts < EXTENSION_SETTINGS_LOAD_ATTEMPTS) {
			console.warn("Retrying extension settings load:", err);
			setTimeout(() => {
				void initializeExtension();
			}, EXTENSION_SETTINGS_RETRY_DELAY_MS);
			return;
		}
		console.error("Failed to load extension settings from storage:", err);
	}
}

initializeExtension();

function hasInitialListingSignals() {
	return (
		getProductOrListingLinks().length > 0 ||
		document.getElementsByClassName(THUMBNAIL_CLASS).length > 0
	);
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
	if (request.action === "update_filters") {
		let shouldProcess = false;
		let filterSettingsChanged = false;
		const noteChange = (changed, affectsFilter = true) => {
			if (!changed) return;
			shouldProcess = true;
			if (affectsFilter) filterSettingsChanged = true;
		};

		noteChange(config.filterActive !== request.filterActive);
		config.filterActive = request.filterActive;

		const nextHiddenSellers = sanitizeList(request.hiddenSellers);
		const hiddenSellersChanged = !areListsEqual(
			config.hiddenSellers,
			nextHiddenSellers,
		);
		noteChange(hiddenSellersChanged);
		if (hiddenSellersChanged) setHiddenSellers(nextHiddenSellers);

		noteChange(
			config.applySellerFilterInLibrary !== request.applySellerFilterInLibrary,
		);
		config.applySellerFilterInLibrary = request.applySellerFilterInLibrary;

		noteChange(
			config.applySavedFilterOnSellerPage !==
				request.applySavedFilterOnSellerPage,
		);
		config.applySavedFilterOnSellerPage = request.applySavedFilterOnSellerPage;

		const nextMinimumReviewCount =
			Number.parseInt(request.minimumReviewCount, 10) || 0;
		noteChange(config.minimumReviewCount !== nextMinimumReviewCount);
		config.minimumReviewCount = nextMinimumReviewCount;

		const nextHiddenKeywords = sanitizeList(request.hiddenKeywords);
		noteChange(!areListsEqual(config.hiddenKeywords, nextHiddenKeywords));
		config.hiddenKeywords = nextHiddenKeywords;

		noteChange(
			config.sortStarsByReviewCount !== request.sortStarsByReviewCount,
			false,
		);
		config.sortStarsByReviewCount = request.sortStarsByReviewCount;

		const nextShowHideSellerButtons = request.showHideSellerButtons !== false;
		noteChange(
			config.showHideSellerButtons !== nextShowHideSellerButtons,
			false,
		);
		config.showHideSellerButtons = nextShowHideSellerButtons;

		const nextActiveFilterPresets = sanitizePresetState(
			request.activeFilterPresets,
		);
		const activeFilterPresetsChanged = !arePresetStatesEqual(
			config.activeFilterPresets,
			nextActiveFilterPresets,
		);
		noteChange(activeFilterPresetsChanged);
		if (activeFilterPresetsChanged) {
			config.activeFilterPresets = nextActiveFilterPresets;
			refreshActiveFilterPresetCache();
		}

		const nextStarSortModeSelector =
			typeof request.starSortModeSelector === "string"
				? request.starSortModeSelector.trim()
				: "";
		noteChange(config.starSortModeSelector !== nextStarSortModeSelector, false);
		config.starSortModeSelector = nextStarSortModeSelector;

		const nextStarSortModeMatch =
			typeof request.starSortModeMatch === "string"
				? request.starSortModeMatch.trim().toLowerCase()
				: "";
		noteChange(config.starSortModeMatch !== nextStarSortModeMatch, false);
		config.starSortModeMatch = nextStarSortModeMatch;

		if (typeof request.extensionActive === "boolean") {
			noteChange(config.extensionActive !== request.extensionActive, false);
			config.extensionActive = request.extensionActive;
		}

		if (filterSettingsChanged) markFilterSettingsChanged();
		if (shouldProcess) {
			ProcessingCoordinator.request({ cause: "message" });
		}
	}

	if (request.action === "update_state") {
		let filterStateChanged = false;
		let shouldProcess = false;
		if (typeof request.state === "boolean") {
			filterStateChanged = config.filterActive !== request.state;
			if (filterStateChanged) {
				config.filterActive = request.state;
				shouldProcess = true;
			}
		}
		if (typeof request.extensionActive === "boolean") {
			if (config.extensionActive !== request.extensionActive) {
				config.extensionActive = request.extensionActive;
				shouldProcess = true;
			}
		}
		if (filterStateChanged) markFilterSettingsChanged();
		if (shouldProcess) {
			ProcessingCoordinator.request({ cause: "message" });
		}
	}

	if (request.action === "add_free_library") {
		void (async () => {
			try {
				const result = await MassAddSession.run();
				if (result?.error) {
					sendResponse({ ok: false, error: result.error });
					return;
				}
				sendResponse({ ok: true, ...result });
			} catch (err) {
				sendResponse({
					ok: false,
					error: err?.message || "Failed to add free items.",
				});
			}
		})();
		return true;
	}
});

chrome.storage.onChanged.addListener((changes, areaName) => {
	if (areaName !== "local") return;
	let shouldProcess = false;
	let filterSettingsChanged = false;
	if (changes.hiddenSellers) {
		const nextHiddenSellers = sanitizeList(changes.hiddenSellers.newValue);
		if (!areListsEqual(config.hiddenSellers, nextHiddenSellers)) {
			setHiddenSellers(nextHiddenSellers);
			filterSettingsChanged = true;
			shouldProcess = true;
		}
	}
	if (changes.hiddenKeywords) {
		const nextHiddenKeywords = sanitizeList(changes.hiddenKeywords.newValue);
		if (!areListsEqual(config.hiddenKeywords, nextHiddenKeywords)) {
			config.hiddenKeywords = nextHiddenKeywords;
			filterSettingsChanged = true;
			shouldProcess = true;
		}
	}
	if (changes.activeFilterPresets) {
		const nextActiveFilterPresets = sanitizePresetState(
			changes.activeFilterPresets.newValue,
		);
		if (
			!arePresetStatesEqual(config.activeFilterPresets, nextActiveFilterPresets)
		) {
			config.activeFilterPresets = nextActiveFilterPresets;
			refreshActiveFilterPresetCache();
			filterSettingsChanged = true;
			shouldProcess = true;
		}
	}
	if (changes.extensionActive) {
		const nextExtensionActive = Boolean(changes.extensionActive.newValue);
		if (config.extensionActive !== nextExtensionActive) {
			config.extensionActive = nextExtensionActive;
			shouldProcess = true;
		}
	}
	if (
		!changes.hiddenSellers &&
		!changes.hiddenKeywords &&
		!changes.activeFilterPresets &&
		!changes.extensionActive
	)
		return;
	if (filterSettingsChanged) markFilterSettingsChanged();
	if (shouldProcess) {
		ProcessingCoordinator.request({ cause: "storage" });
	}
});

function isBetterFabManagedNode(node) {
	const element = node instanceof Element ? node : node.parentElement;
	if (!element) return false;

	return Boolean(closestBetterFabManagedElement(element));
}

function getRelevantMutationElement(node) {
	const element = node instanceof Element ? node : node.parentElement;
	if (
		!element ||
		element === document.body ||
		isBetterFabManagedNode(element)
	) {
		return null;
	}

	return element;
}

function addChangedElementCards(element, changedCards) {
	if (!element) {
		return false;
	}

	if (isListingNodeElement(element)) {
		const card = getCardFromListingNode(element);
		if (card) changedCards.add(card);
		return Boolean(card);
	}

	if (addListingDescendantCards(element, changedCards)) {
		return true;
	}

	let current = element;
	let attempts = 0;
	while (current && current !== document.body && attempts < 8) {
		const listingNodes = getListingDescendantNodes(current, 2);
		const listingCount = listingNodes.length;
		if (listingCount === 1) {
			const card = getCardFromListingNode(listingNodes[0]);
			if (card) changedCards.add(card);
			return Boolean(card);
		}
		if (listingCount > 1) return false;

		current = current.parentElement;
		attempts += 1;
	}

	return false;
}

function addChangedNodeCards(node, changedCards) {
	return addChangedElementCards(getRelevantMutationElement(node), changedCards);
}

function collectChangedMutationNode(node, changedCards) {
	const element = getRelevantMutationElement(node);
	if (!element) return 0;
	return addChangedElementCards(element, changedCards) ? 2 : 1;
}

function collectChangedListingCards(mutations, includeRemovedNodes = false) {
	const changedCards = new Set();

	for (const mutation of mutations) {
		const addedNodeCount = mutation.addedNodes.length;
		if (addedNodeCount === 0) {
			if (!includeRemovedNodes || mutation.removedNodes.length === 0) {
				continue;
			}
		}

		let foundChangedCard = false;
		let foundRelevantMutationNode = false;
		for (const node of mutation.addedNodes) {
			const collectionStatus = collectChangedMutationNode(node, changedCards);
			if (collectionStatus === 0) continue;
			foundRelevantMutationNode = true;
			if (collectionStatus === 2) foundChangedCard = true;
		}
		if (includeRemovedNodes) {
			for (const node of mutation.removedNodes) {
				const collectionStatus = collectChangedMutationNode(node, changedCards);
				if (collectionStatus === 0) continue;
				foundRelevantMutationNode = true;
				if (collectionStatus === 2) foundChangedCard = true;
			}
		}

		if (foundRelevantMutationNode && !foundChangedCard) {
			addChangedNodeCards(mutation.target, changedCards);
		}
	}

	return changedCards;
}

function hasRelevantProductPageMutation(mutations) {
	for (const mutation of mutations) {
		for (const node of [...mutation.addedNodes, ...mutation.removedNodes]) {
			if (getRelevantMutationElement(node)) return true;
		}
	}

	return false;
}

const observer = new MutationObserver((mutations) => {
	if (!config.extensionActive) return;

	const pathname = window.location.pathname;
	const isSellerPage = pathname.startsWith("/sellers/");
	const isProductPage =
		pathname.startsWith("/listings/") || pathname.startsWith("/products/");
	const potentialStarSortWork = isSellerPage
		? false
		: hasPotentialStarSortWork();
	if (
		!hasPotentialCardProcessingWork(
			pathname,
			potentialStarSortWork,
			isSellerPage,
		)
	)
		return;

	const shouldTrackRemovedCards = isSellerPage || potentialStarSortWork;
	const changedCards = collectChangedListingCards(
		mutations,
		shouldTrackRemovedCards,
	);
	if (!changedCards.size) {
		if (isProductPage && hasRelevantProductPageMutation(mutations)) {
			ProcessingCoordinator.request({
				cause: "mutation",
				forceFullScan: true,
			});
		}
		return;
	}

	for (const card of changedCards) {
		markCardContentChanged(card);
	}
	ProcessingCoordinator.request({
		cards: changedCards,
		cause: "mutation",
	});
});

observer.observe(document.body, {
	childList: true,
	subtree: true,
});
