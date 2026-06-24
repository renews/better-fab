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
let initialStartupProcessAttempts = 0;


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
const THUMBNAIL_SELECTOR = `.${THUMBNAIL_CLASS}`;
const PRODUCT_LINK_SELECTOR = 'a[href*="/products/"]';
const LISTING_LINK_SELECTOR = 'a[href*="/listings/"]';
const PRODUCT_OR_LISTING_LINK_SELECTOR = 'a[href*="/products/"], a[href*="/listings/"]';
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
const SELLER_ROW_SELECTOR = `.${SELLER_ROW_CLASS}`;
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
const LISTING_NODE_CARD_CACHE = new WeakMap();
const CARD_CONTENT_VERSION_CACHE = new WeakMap();
const CARD_DOM_SIGNATURE_CACHE = new WeakMap();
const EMPTY_ENTRIES = [];
const LIBRARY_BUTTON_SELECTOR =
	"button, a[role='button'], [role='button'], [data-action], [data-testid], [data-test], a[href], [aria-label], [title]";
const LIBRARY_ACTION_HINTS =
	/\b(add|add to|save|save to|saved|get|install|library|collection|wishlist|bookmark)\b/i;
const LIBRARY_REVEAL_EVENT_TYPES = [
	"pointerover",
	"mouseover",
	"mouseenter",
	"mousemove",
];
const FREE_PRICE_PATTERNS = [
	/\$\s*0(?:[.,]\d{1,2})?\b/i,
	/\b0(?:[.,]\d{1,2})?\s*(?:usd|eur|gbp|aud|cad|nzd|brl|mxn|inr|jpy|krw|cny)?\b/i,
	/(?:^|\s|[A-Z$£€¥₹])0(?:[.,]\d{1,2})?\b/i,
	/\b(?:free|gratis)\b/i,
	/\bprice\s*(?:is|:)?\s*(?:free|0(?:[.,]\d{1,2})?)\b/i,
	/\bno\s+cost\b/i,
];
const ADD_LIBRARY_TEXT_PATTERNS = [
	/add\s+to\s+library/i,
	/save\s+to\s+library/i,
	/\badd\s+to\s+collection\b/i,
	/\bsave\s+to\s+my\s+list\b/i,
	/\bsave\b/i,
	/\badd\b/i,
	/\bget\b/i,
	/\binstalled?\b/i,
];
const LICENSE_MODAL_SELECTOR = 'div[role="dialog"][aria-modal="true"]';
const LICENSE_MODAL_TITLE_SELECTOR = ".fabkit-Modal-title";
const LICENSE_FORM_FIELD_SELECTOR = ".fabkit-FormField-root";
const LICENSE_MODAL_ADD_BUTTON_SELECTOR = ".fabkit-Modal-actions button";
const LICENSE_MODAL_CLOSE_SELECTOR = ".fabkit-Modal-closeButton";
const ADD_LIBRARY_ACTION_SELECTOR =
	"button, a, [role='button'], [data-action], [data-testid], [data-test], [aria-label], [title]";
const PRICE_ATTRIBUTE_SELECTORS = [
	"[data-price]",
	"[data-test='price']",
	"[data-qa='price']",
	"[data-testid*='price']",
	"[itemprop='price']",
];
const PRICE_ATTRIBUTE_SELECTOR = PRICE_ATTRIBUTE_SELECTORS.join(", ");
const LICENSE_ACTION_REVEAL_DELAY_MS = 120;
const ADD_LIBRARY_PROXIMITY_RADIUS_PX = 260;
const MUTATION_PROCESS_DEBOUNCE_MS = 175;
const MUTATION_PROCESS_IDLE_TIMEOUT_MS = 700;
const STABLE_LISTING_REPROCESS_INTERVAL_MS = 5000;
const SKIP_LIBRARY_BUTTON_PATTERNS = [
	/\balready\s+in\s+library\b/i,
	/\bin\s+library\b/i,
	/\bsaved\b/i,
	/\bowned\b/i,
	/\bremove\s+from\s+library\b/i,
];
const LICENSE_NO_MODAL_DEBOUNCE_MIN_MS = 50;
const LICENSE_NO_MODAL_DEBOUNCE_MAX_MS = 150;
const LICENSE_MODAL_WAIT_CLOSE_MAX_MS = 1200;
const INITIAL_STARTUP_PROCESS_ATTEMPTS = 10;
const INITIAL_STARTUP_PROCESS_DELAY_MS = 300;

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

function normalizeListingPath(path) {
	if (!path) return "";

	try {
		return new URL(path, window.location.origin).pathname.toLowerCase();
	} catch (err) {
		return String(path || "")
			.trim()
			.toLowerCase()
			.split("?")[0]
			.split("#")[0];
	}
}

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

function getSellerLink(card) {
	const links = card.getElementsByTagName?.("a");
	if (!links) return null;

	for (const link of links) {
		if (link.getAttribute("href")?.startsWith("/sellers/")) return link;
	}

	return null;
}

function getSellerName(card, sellerLink = getSellerLink(card)) {
	if (!sellerLink) return "";
	return sellerLink.textContent.trim().toLowerCase();
}

function getCardSellerInfo(card) {
	const contentVersion = getCardContentVersion(card);
	const cached = CARD_SELLER_INFO_CACHE.get(card);
	if (cached?.contentVersion === contentVersion) return cached.info;

	const sellerLink = getSellerLink(card);
	const info = {
		sellerLink,
		sellerName: getSellerName(card, sellerLink),
	};
	CARD_SELLER_INFO_CACHE.set(card, { contentVersion, info });
	return info;
}

function getSellerNameFromPathname(pathname) {
	const match = pathname.match(/^\/sellers\/([^/?#]+)/);
	if (!match) return "";

	try {
		return decodeURIComponent(match[1].replace(/\+/g, " "))
			.trim()
			.toLowerCase();
	} catch (err) {
		return match[1].trim().toLowerCase();
	}
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

function hasFreePricePatternMatch(value) {
	const text = String(value || "");
	for (const pattern of FREE_PRICE_PATTERNS) {
		if (pattern.test(text)) return true;
	}

	return false;
}

function isFreeByText(value) {
	return hasFreePricePatternMatch(value);
}

function hasFreePriceFromCard(card, metrics) {
	const search = metrics.searchText || "";
	const priceNodes = card.querySelectorAll(PRICE_ATTRIBUTE_SELECTOR);

	for (const node of priceNodes) {
		const content = String(
			node.getAttribute("content") ||
				node.getAttribute("value") ||
				node.getAttribute("data-price") ||
				node.textContent ||
				"",
		).toLowerCase();

		if (hasFreePricePatternMatch(content)) return true;
	}

	if (/\b\$\s*0(?:[.,]\d{1,2})?\b|\bfree\b/.test(search)) return true;

	return false;
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDebounceDelayMs() {
	const range =
		LICENSE_NO_MODAL_DEBOUNCE_MAX_MS - LICENSE_NO_MODAL_DEBOUNCE_MIN_MS;
	const delta = Math.floor(Math.random() * (range + 1));
	return LICENSE_NO_MODAL_DEBOUNCE_MIN_MS + delta;
}

function dispatchInteractionEvents(target) {
	if (!target) return;

	if (typeof target.focus === "function") target.focus({ preventScroll: true });

	const rect = target.getBoundingClientRect();
	const clientX = Math.max(1, rect.left + Math.min(rect.width, 1) / 2);
	const clientY = Math.max(1, rect.top + Math.min(rect.height, 1) / 2);

	for (const type of LIBRARY_REVEAL_EVENT_TYPES) {
		target.dispatchEvent(
			new MouseEvent(type, {
				bubbles: true,
				cancelable: true,
				view: window,
				clientX,
				clientY,
			}),
		);
	}
}

async function revealCardActionControls(card) {
	const host = card.closest("article, section, li, div") || card;
	const thumbnail = card.querySelector(THUMBNAIL_SELECTOR);
	const listingLink = card.querySelector(PRODUCT_OR_LISTING_LINK_SELECTOR);

	for (let pass = 0; pass < 2; pass += 1) {
		dispatchInteractionEvents(card);
		dispatchInteractionEvents(thumbnail);
		dispatchInteractionEvents(listingLink);
		dispatchInteractionEvents(host);

		const rect = card.getBoundingClientRect();
		if (rect.width > 0 && rect.height > 0) {
			dispatchInteractionEvents(
				document.elementFromPoint(
					rect.left + rect.width / 2,
					rect.top + rect.height / 2,
				),
			);
			dispatchInteractionEvents(
				document.elementFromPoint(rect.left + 4, rect.top + 4),
			);
			dispatchInteractionEvents(
				document.elementFromPoint(rect.right - 4, rect.top + 4),
			);
			dispatchInteractionEvents(
				document.elementFromPoint(rect.left + 4, rect.bottom - 4),
			);
		}

		await sleep(40);
	}

	await sleep(LICENSE_ACTION_REVEAL_DELAY_MS);
}

function isPriceFree(value) {
	return hasFreePricePatternMatch(value);
}

function getVisibleLicenseModal() {
	const dialogs = document.querySelectorAll(LICENSE_MODAL_SELECTOR);

	for (const dialog of dialogs) {
		if (!dialog?.isConnected) continue;

		const rect = dialog.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) continue;
		if (dialog.getAttribute("aria-hidden") === "true") continue;

		const titleElement = dialog.querySelector(LICENSE_MODAL_TITLE_SELECTOR);
		const legacyTitle = dialog.querySelector("h2");
		const titleText = String(
			titleElement?.textContent || legacyTitle?.textContent || "",
		).toLowerCase();
		if (titleText.includes("license tier")) return dialog;
	}

	return null;
}

async function waitForLicenseModal(timeoutMs = 900) {
	const endTime = Date.now() + timeoutMs;
	while (Date.now() < endTime) {
		const modal = getVisibleLicenseModal();
		if (modal) return modal;
		await sleep(60);
	}

	return null;
}

async function waitForLicenseModalToClose(
	modal,
	timeoutMs = LICENSE_MODAL_WAIT_CLOSE_MAX_MS,
) {
	if (!modal) return;

	const endTime = Date.now() + timeoutMs;
	while (Date.now() < endTime) {
		if (!modal.isConnected) return;
		if (!document.body || !document.body.contains(modal)) return;

		const rect = modal.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) return;
		if (modal.getAttribute("aria-hidden") === "true") return;

		await sleep(60);
	}
}

function getPreferredLicenseInput(modal) {
	const fields = modal.querySelectorAll(LICENSE_FORM_FIELD_SELECTOR);
	let hasProfessional = false;
	let hasPersonal = false;
	let professionalInput = null;
	let personalInput = null;
	let professionalIsFree = false;
	let personalIsFree = false;

	const allCandidates = [];

	for (const field of fields) {
		const label = field.querySelector("label");
		const labelText = String(label?.textContent || "").toLowerCase();
		const optionText = String(field.textContent || "").toLowerCase();
		if (!labelText && !optionText) continue;

		const clickableTarget =
			field.querySelector("label") ||
			field;

		if (!clickableTarget) continue;

		const isFree = isPriceFree(optionText) || isPriceFree(labelText);
		allCandidates.push({ input: clickableTarget, isFree, text: optionText + " " + labelText });

		const isPersonal = /\bpersonal\b/.test(labelText);
		const isProfessional = /\bprofessional\b/.test(labelText);

		if (isProfessional && !hasProfessional) {
			hasProfessional = true;
			professionalInput = clickableTarget;
			professionalIsFree = isFree;
		} else if (isPersonal && !hasPersonal) {
			hasPersonal = true;
			personalInput = clickableTarget;
			personalIsFree = isFree;
		}
	}

	if (hasPersonal && personalIsFree) return personalInput;
	if (hasProfessional && professionalIsFree) return professionalInput;

	const freeCandidate = allCandidates.find((c) => c.isFree);
	if (freeCandidate) return freeCandidate.input;

	return null;
}

function closeLicenseModal(modal) {
	const closeButton = modal.querySelector(
		'button[aria-label="Close"], .fabkit-Modal-closeButton, .close-button, button svg'
	)?.closest('button');
	if (closeButton) {
        closeButton.click();
    } else {
        const buttons = modal.querySelectorAll('button');
        for (const btn of buttons) {
            if (!btn.textContent.trim()) {
                btn.click();
                break;
            }
        }
    }
}

function getLicenseModalAddButton(modal) {
	const actionButtons = modal.querySelectorAll(
		LICENSE_MODAL_ADD_BUTTON_SELECTOR,
	);

	for (const button of actionButtons) {
		const text = String(
			button.textContent || button.getAttribute("aria-label") || "",
		)
			.trim()
			.toLowerCase();
		if (
			text.includes("add") ||
			text.includes("save") ||
			text.includes("confirm") ||
			text.includes("checkout") ||
			text.includes("get") ||
			text.includes("accept")
		) {
			return button;
		}
	}

	if (actionButtons.length > 0) {
		return actionButtons[actionButtons.length - 1];
	}

	return null;
}

function closeLicenseModal(modal) {
	const closeButton = modal.querySelector(
		`${LICENSE_MODAL_CLOSE_SELECTOR}, button[aria-label="Close"]`,
	);
	if (closeButton) {
		closeButton.click();
		return;
	}

	const esc = new KeyboardEvent("keydown", {
		bubbles: true,
		cancelable: true,
		key: "Escape",
		keyCode: 27,
	});
	window.dispatchEvent(esc);
}

async function handleLicenseSelectionForLastClick() {
	const modal = await waitForLicenseModal();
	if (!modal) return { status: "none", hadModal: false, modal: null };

	let preferredInput = getPreferredLicenseInput(modal);
	let renderAttempts = 0;
	while (!preferredInput && renderAttempts < 15) {
		await sleep(100);
		preferredInput = getPreferredLicenseInput(modal);
		renderAttempts++;
	}

	if (!preferredInput) {
		closeLicenseModal(modal);
		return { status: "skipped", hadModal: true, modal };
	}

	if (preferredInput.tagName === "INPUT" && !preferredInput.checked) {
		preferredInput.click();
		await sleep(50);
	} else if (preferredInput.tagName !== "INPUT") {
		preferredInput.click();
		await sleep(50);
	}

	let addButton = getLicenseModalAddButton(modal);
	let btnAttempts = 0;
	while (!addButton && btnAttempts < 15) {
		await sleep(100);
		addButton = getLicenseModalAddButton(modal);
		btnAttempts++;
	}

	if (!addButton) {
		closeLicenseModal(modal);
		return { status: "skipped", hadModal: true, modal };
	}

	const endTime = Date.now() + 1200;
	while (addButton.disabled && Date.now() < endTime) {
		await sleep(70);
		addButton = getLicenseModalAddButton(modal);
		if (!addButton) {
			closeLicenseModal(modal);
			return { status: "skipped", hadModal: true, modal };
		}
	}

	if (addButton.disabled) {
		closeLicenseModal(modal);
		return { status: "skipped", hadModal: true, modal };
	}

	addButton.click();
	await sleep(150);
	return { status: "added", hadModal: true, modal };
}

function hasSkipLibraryButtonText(text) {
	for (const pattern of SKIP_LIBRARY_BUTTON_PATTERNS) {
		if (pattern.test(text)) return true;
	}

	return false;
}

function hasAddLibraryActionText(text) {
	for (const pattern of ADD_LIBRARY_TEXT_PATTERNS) {
		if (pattern.test(text)) return true;
	}

	return false;
}

function getAddLibraryCandidateText(element) {
	return String(
		`${element.textContent || ""} ${element.getAttribute("aria-label") || ""} ${
			element.title || ""
		}`,
	)
		.toLowerCase()
		.trim();
}

function isAddLibraryCandidate(element, options = {}) {
	if (!element) return false;
	if (element.closest(IGNORE_SELLER_BUTTON_SELECTOR)) return false;
	if (element.getAttribute("aria-disabled") === "true") return false;
	if (element.disabled) return false;

	const requireStrictText = options.requireStrictText ?? true;
	const skipVisibilityCheck = options.skipVisibilityCheck === true;

	if (!skipVisibilityCheck && element.offsetParent === null) {
		const bounds = element.getBoundingClientRect();
		if (!bounds.width && !bounds.height) return false;
	}

	const href = String(element.getAttribute("href") || "").toLowerCase();
	if (
		element.tagName === "A" &&
		href &&
		(href.includes("/products/") ||
			href.includes("/listings/") ||
			href.includes("/sellers/"))
	) {
		return false;
	}

	const text = options.text ?? getAddLibraryCandidateText(element);
	if (!text) return false;
	if (hasSkipLibraryButtonText(text)) {
		return false;
	}

	if (!LIBRARY_ACTION_HINTS.test(text)) return false;

	if (!requireStrictText) {
		return true;
	}

	return hasAddLibraryActionText(text);
}

function getAddLibraryButton(card, options = {}) {
	const candidates = card.querySelectorAll(LIBRARY_BUTTON_SELECTOR);
	for (const candidate of candidates) {
		if (isAddLibraryCandidate(candidate, options)) return candidate;
	}

	return null;
}

function getRectDistanceSquared(rectA, rectB) {
	const deltaX = Math.max(
		rectA.left - rectB.right,
		rectB.left - rectA.right,
		0,
	);
	const deltaY = Math.max(
		rectA.top - rectB.bottom,
		rectB.top - rectA.bottom,
		0,
	);
	return deltaX * deltaX + deltaY * deltaY;
}

function findNearbyAddLibraryButton(card) {
	const cardRect = card.getBoundingClientRect();
	if (!cardRect || (!cardRect.width && !cardRect.height)) return null;

	const maxDistance = Math.max(
		ADD_LIBRARY_PROXIMITY_RADIUS_PX,
		cardRect.width,
		cardRect.height,
	);
	const maxDistanceSquared = maxDistance * maxDistance;

	let closestCandidate = null;
	let closestDistanceSquared = Infinity;
	const candidates = document.querySelectorAll(ADD_LIBRARY_ACTION_SELECTOR);

	for (const candidate of candidates) {
		let rect = null;
		if (candidate.offsetParent === null) {
			rect = candidate.getBoundingClientRect();
			if (!rect || (!rect.width && !rect.height)) continue;
		}

		if (
			!isAddLibraryCandidate(candidate, {
				requireStrictText: false,
				skipVisibilityCheck: true,
			})
		) {
			continue;
		}

		if (!rect) {
			rect = candidate.getBoundingClientRect();
			if (!rect || (!rect.width && !rect.height)) continue;
		}

		const distanceSquared = getRectDistanceSquared(cardRect, rect);
		if (
			distanceSquared > maxDistanceSquared ||
			distanceSquared >= closestDistanceSquared
		) {
			continue;
		}

		closestCandidate = candidate;
		closestDistanceSquared = distanceSquared;
	}

	return closestCandidate;
}

async function findAddButtonForCard(card) {
	await revealCardActionControls(card);
	let button = getAddLibraryButton(card, { skipVisibilityCheck: false });
	if (button) return button;

	button = getAddLibraryButton(card, { skipVisibilityCheck: true });
	if (button) return button;

	// 4. Fallback to searching nearby (last resort)
	return findNearbyAddLibraryButton(card);
}

async function ensureNoActiveModal(timeoutMs = 1500) {
	const endTime = Date.now() + timeoutMs;
	while (Date.now() < endTime) {
		const modal = getVisibleLicenseModal();
		if (!modal) return;
		await sleep(90);
	}
}

let isMassAdding = false;

async function addVisibleFreeItemsToLibrary() {
	if (isMassAdding) return { error: "Already running" };
	isMassAdding = true;

	const massProcessedCards = new Set();
	const cumulative = {
		attempted: 0,
		added: 0,
		alreadyInLibrary: 0,
		skipped: 0,
		noActionButton: 0,
	};
	let noNewItemsCount = 0;
	const MAX_NO_NEW_ITEMS = 3;

	try {
		while (isMassAdding) {
			const batchResult = await processVisibleBatch(massProcessedCards);
			
			cumulative.attempted += batchResult.attempted;
			cumulative.added += batchResult.added;
			cumulative.alreadyInLibrary += batchResult.alreadyInLibrary;
			cumulative.skipped += batchResult.skipped;
			cumulative.noActionButton += batchResult.noActionButton;
			
			window.scrollTo({
				top: document.body.scrollHeight,
				behavior: "smooth"
			});
			
			await sleep(2000); // Wait for pagination to trigger
			
			if (batchResult.attempted === 0) {
				noNewItemsCount += 1;
				if (noNewItemsCount >= MAX_NO_NEW_ITEMS) {
					break;
				}
				await sleep(2000); // Extra wait to be sure it's not just a slow network
			} else {
				noNewItemsCount = 0;
			}
		}
	} finally {
		isMassAdding = false;
	}

	alert(
		`The extension Better Fab says\n\n` +
		`Visible free items processed: ${cumulative.attempted}. Added: ${cumulative.added}. ` +
		`Already in library: ${cumulative.alreadyInLibrary}. Failed to click: ${cumulative.skipped}. ` +
		`No action button: ${cumulative.noActionButton}`
	);

	return cumulative;
}

async function processVisibleBatch(massProcessedCards) {
	const listingNodes = getListingScanNodes();
	const cards = [];

	for (const item of listingNodes) {
		const card = getCardFromListingNode(item);
		if (!card || massProcessedCards.has(card)) continue;
		massProcessedCards.add(card);
		if (card.classList.contains("fab-hidden-item")) continue;

		const rect = card.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) continue;

		const metrics = getCardMetrics(card);
		const isFree =
			isFreeByText(metrics.searchText) || hasFreePriceFromCard(card, metrics);
		if (!isFree) continue;

		cards.push({ card, metrics });
	}

	cards.sort((a, b) => {
		const rectA = a.card.getBoundingClientRect();
		const rectB = b.card.getBoundingClientRect();
		if (Math.abs(rectA.top - rectB.top) > 5) {
			return rectA.top - rectB.top;
		}
		return rectA.left - rectB.left;
	});

	let attempted = cards.length;
	let added = 0;
	let alreadyInLibrary = 0;
	let skipped = 0;
	let noActionButton = 0;

	for (const { card } of cards) {
		await ensureNoActiveModal();

		const button = await findAddButtonForCard(card);
		if (!button) {
			noActionButton += 1;
			continue;
		}

		const label = String(
			`${button.textContent || ""} ${button.getAttribute("aria-label") || ""} ${
				button.title || ""
			}`,
		)
			.toLowerCase()
			.trim();
		if (hasSkipLibraryButtonText(label) || /in\s+library/.test(label)) {
			alreadyInLibrary += 1;
			continue;
		}

		try {
			button.scrollIntoView({
				behavior: "auto",
				block: "center",
				inline: "center",
			});
			await sleep(70);

			button.click();

			const licenseResult = await handleLicenseSelectionForLastClick();
			if (licenseResult.hadModal) {
				await waitForLicenseModalToClose(licenseResult.modal);
			} else {
				await sleep(randomDebounceDelayMs());
			}

			if (licenseResult.status === "skipped") {
				skipped += 1;
				continue;
			}

			added += 1;
		} catch (err) {
			skipped += 1;
		}
	}

	return {
		attempted,
		added,
		alreadyInLibrary,
		skipped,
		noActionButton,
	};
}

function parseCountToken(value) {
	const raw = String(value || "").trim();
	const normalized = raw.replace(/,/g, "");
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

function getCachedCardFromListingNode(listingNode) {
	const cached = LISTING_NODE_CARD_CACHE.get(listingNode);
	if (!cached?.isConnected) return null;
	if (!cached.contains(listingNode)) return null;
	return cached;
}

function cacheCardFromListingNode(listingNode, card) {
	if (card) LISTING_NODE_CARD_CACHE.set(listingNode, card);
	return card;
}

function isProductHref(href) {
	return (
		href.startsWith("/products/") ||
		href.includes("://www.fab.com/products/") ||
		href.includes("://fab.com/products/")
	);
}

function isProductOrListingHref(href) {
	if (!href) return false;
	const lowerHref = href.toLowerCase();
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
	
	if (/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i.test(href)) return true;
	if (/\/([a-z]{2}(?:-[a-zA-Z]{2,4})?\/)?(products|listings|models|assets|items|plugins|environments|materials|characters|vehicles|weapons|props)\//i.test(href)) return true;
	if (/\/\d+-[a-z0-9-]+/i.test(href)) return true;

	const path = href.split('?')[0].split('#')[0];
	const segments = path.split('/').filter(Boolean);
	if (segments.length >= 2 && !href.startsWith("javascript:") && !href.startsWith("mailto:")) {
		return true;
	}

	return false;
}

function isProductOrListingLinkElement(node) {
	return (
		node?.localName === "a" &&
		isProductOrListingHref(node.getAttribute("href") || "")
	);
}

function getFirstProductOrListingHref(node) {
	const links = node.getElementsByTagName?.("a");
	if (!links) return "";

	for (const link of links) {
		const href = link.getAttribute("href") || "";
		if (isProductOrListingHref(href)) return href;
	}

	return "";
}

function getProductOrListingLinks(root = document) {
	const links = root.getElementsByTagName?.("a");
	const listingLinks = [];
	if (!links) return listingLinks;

	for (const link of links) {
		if (isProductOrListingHref(link.getAttribute("href") || "")) {
			listingLinks.push(link);
		}
	}

	return listingLinks;
}

function getListingDescendantNodes(root, limit = Number.POSITIVE_INFINITY) {
	const listingNodes = [];
	const thumbnails = root.getElementsByClassName?.(THUMBNAIL_CLASS);
	if (thumbnails) {
		for (const thumbnail of thumbnails) {
			listingNodes.push(thumbnail);
			if (listingNodes.length >= limit) return listingNodes;
		}
	}

	const links = root.getElementsByTagName?.("a");
	if (links) {
		for (const link of links) {
			if (isProductOrListingHref(link.getAttribute("href") || "")) {
				listingNodes.push(link);
				if (listingNodes.length >= limit) return listingNodes;
			}
		}
	}

	return listingNodes;
}

function addListingDescendantCards(root, changedCards) {
	let foundListingNode = false;
	const thumbnails = root.getElementsByClassName?.(THUMBNAIL_CLASS);
	if (thumbnails) {
		for (const thumbnail of thumbnails) {
			foundListingNode = true;
			const card = getCardFromListingNode(thumbnail);
			if (card) changedCards.add(card);
		}
	}

	const links = root.getElementsByTagName?.("a");
	if (links) {
		for (const link of links) {
			if (!isProductOrListingHref(link.getAttribute("href") || "")) continue;

			foundListingNode = true;
			const card = getCardFromListingNode(link);
			if (card) changedCards.add(card);
		}
	}

	return foundListingNode;
}

function isCardContainerElement(node) {
	const tagName = node?.localName;
	return (
		tagName === "article" ||
		tagName === "section" ||
		tagName === "li" ||
		tagName === "div"
	);
}

function isListingNodeElement(node) {
	return (
		node?.classList?.contains(THUMBNAIL_CLASS) ||
		isProductOrListingLinkElement(node)
	);
}

function getCardFromListingNode(listingNode) {
	if (!listingNode) return null;
	if (listingNode.closest?.(LICENSE_MODAL_SELECTOR)) return null;

	const cachedCard = getCachedCardFromListingNode(listingNode);
	if (cachedCard) return cachedCard;


	let node = listingNode;
	let attempts = 0;

	while (node && node !== document.body && attempts < 16) {
		const parent = node.parentElement;
		if (parent && parent !== document.body) {
			const siblings = parent.children;
			if (siblings.length >= 2) {
				const uniqueHrefs = new Set();
				for (const sibling of siblings) {
					const href = getFirstProductOrListingHref(sibling);
					if (href) {
						uniqueHrefs.add(href.split('?')[0].split('#')[0]);
						if (uniqueHrefs.size >= 2) {
							return cacheCardFromListingNode(listingNode, node);
						}
					}
				}
			}
		}
		node = node.parentElement;
		attempts += 1;
	}

	return cacheCardFromListingNode(listingNode, listingNode.parentElement);
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
	processItems();
}

function updateSellerPageIgnoreButton(button, sellerName) {
	const isIgnored = hiddenSellerSet.has(sellerName);
	const label = isIgnored
		? "Seller removed from listings"
		: "Remove seller from listings";

	if (button.disabled !== isIgnored) button.disabled = isIgnored;
	setTextContent(button, label);
}

function formatCount(value) {
	return Math.round(value).toLocaleString();
}

function getSellerRatingSummary(entries) {
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
	const averageElement = profile.querySelector(SELLER_PROFILE_AVERAGE_SELECTOR);
	const countElement = profile.querySelector(SELLER_PROFILE_COUNT_SELECTOR);
	const ratingSummary = getSellerRatingSummary(entries);

	button.dataset.seller = sellerName;
	button.hidden = !config.showHideSellerButtons;
	updateSellerPageIgnoreButton(button, sellerName);

	const averageText =
		ratingSummary.average === null
			? "No ratings yet"
			: `${ratingSummary.average.toFixed(1)} / 5`;
	const reviewText =
		ratingSummary.totalReviews > 0
			? `${formatCount(ratingSummary.totalReviews)} reviews`
			: "0 reviews";
	const packageText =
		ratingSummary.totalPackages === 1
			? "1 package"
			: `${formatCount(ratingSummary.totalPackages)} packages`;
	const countText = `${reviewText} across ${packageText}`;

	setTextContent(averageElement, averageText);
	setTextContent(countElement, countText);

	const sellerItemsContainer = getSellerItemsContainer(entries);
	if (sellerItemsContainer?.parentElement) {
		sellerItemsContainer.parentElement.insertBefore(
			profile,
			sellerItemsContainer,
		);
		return;
	}

	if (!profile.isConnected) {
		const heading = document.querySelector("h1");
		if (heading?.parentElement) {
			heading.parentElement.insertBefore(profile, heading.nextSibling);
			return;
		}

		document.body.prepend(profile);
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
	needsExtensionCleanup = false;
}

function getListingScanNodes() {
	const listingLinks = getProductOrListingLinks();
	if (listingLinks.length > 0) return listingLinks;
	return document.getElementsByClassName(THUMBNAIL_CLASS);
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
	const shouldBypassFilters = isHomePage || isLimitedTimeFreePage;
	const shouldApplyStarSort =
		config.sortStarsByReviewCount && isStarSortActive();
	const hasActivePresets = hasAnyActivePreset();
	let hasWork = false;

	if (isSellerPage || config.showHideSellerButtons || shouldApplyStarSort) {
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

	if (
		!isSellerPage &&
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
	const shouldBypassFilters =
		cardProcessingState.shouldBypassFilters ??
		(isHomePage || isLimitedTimeFreePage);

	if (!cardProcessingState.hasWork) {
		cleanupExtensionManipulations(listingSetSignature);
		return;
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



async function initializeExtension() {
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
		}
		markFilterSettingsChanged();
		processItems();
		queueStartupProcess();
	} catch (err) {
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

function queueStartupProcess() {
	if (!config.extensionActive) return;
	if (!hasPotentialCardProcessingWork()) return;
	if (initialStartupProcessAttempts >= INITIAL_STARTUP_PROCESS_ATTEMPTS) return;
	if (hasInitialListingSignals()) return;

	initialStartupProcessAttempts += 1;
	setTimeout(() => {
		processItems();
		queueStartupProcess();
	}, INITIAL_STARTUP_PROCESS_DELAY_MS);
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
		if (shouldProcess) processItems();
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
		if (shouldProcess) processItems();
	}

	if (request.action === "add_free_library") {
		void (async () => {
			try {
				const result = await addVisibleFreeItemsToLibrary();
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
	if (shouldProcess) processItems();
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

let debounceTimeout = null;
let idleCallbackId = null;
let pendingMutationCards = new Set();
let pendingFullMutationScan = false;

function mergePendingMutationCards(targetCards) {
	if (pendingMutationCards.size === 0) return targetCards;

	for (const card of pendingMutationCards) {
		targetCards.add(card);
	}
	pendingMutationCards = new Set();
	return targetCards;
}

function scheduleProcessItemsFromMutation(forceFullScan = false) {
	if (forceFullScan) pendingFullMutationScan = true;
	if (debounceTimeout !== null || idleCallbackId !== null) return;

	debounceTimeout = setTimeout(() => {
		debounceTimeout = null;

		if (!config.extensionActive) {
			pendingMutationCards = new Set();
			pendingFullMutationScan = false;
			return;
		}

		const currentCardProcessingState = getCardProcessingState();
		if (!currentCardProcessingState.hasWork) {
			pendingMutationCards = new Set();
			pendingFullMutationScan = false;
			return;
		}

		const shouldForceFullScan = pendingFullMutationScan;
		pendingFullMutationScan = false;
		const targetCards = shouldForceFullScan ? null : pendingMutationCards;
		pendingMutationCards = new Set();
		const hasTargetCards = targetCards?.size > 0;
		const listingSetSignature = hasTargetCards
			? null
			: getListingSetSignature();
		const timeSinceLastProcess = Date.now() - lastProcessItemsCompletedAt;
		if (
			!shouldForceFullScan &&
			!hasTargetCards &&
			listingSetSignature === lastProcessedListingSignature &&
			timeSinceLastProcess < STABLE_LISTING_REPROCESS_INTERVAL_MS
		) {
			return;
		}

		if (typeof window.requestIdleCallback === "function") {
			idleCallbackId = window.requestIdleCallback(
				() => {
					idleCallbackId = null;
					const runFullScan = shouldForceFullScan || pendingFullMutationScan;
					if (runFullScan) {
						pendingFullMutationScan = false;
						pendingMutationCards = new Set();
					}
					processItems(
						runFullScan ? null : listingSetSignature,
						runFullScan ? null : mergePendingMutationCards(targetCards),
						currentCardProcessingState,
					);
				},
				{ timeout: MUTATION_PROCESS_IDLE_TIMEOUT_MS },
			);
			return;
		}

		processItems(
			shouldForceFullScan ? null : listingSetSignature,
			targetCards,
			currentCardProcessingState,
		);
	}, MUTATION_PROCESS_DEBOUNCE_MS);
}

function hasAddedMutationNodes(mutations) {
	for (const mutation of mutations) {
		if (mutation.addedNodes.length > 0) return true;
	}

	return false;
}

const observer = new MutationObserver((mutations) => {
	if (!config.extensionActive) return;

	const pathname = window.location.pathname;
	const isSellerPage = pathname.startsWith("/sellers/");
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
	if (!changedCards.size) return;

	let addedPendingCard = false;
	for (const card of changedCards) {
		if (pendingMutationCards.has(card)) continue;
		markCardContentChanged(card);
		pendingMutationCards.add(card);
		addedPendingCard = true;
	}
	if (addedPendingCard) scheduleProcessItemsFromMutation();
});

observer.observe(document.body, {
	childList: true,
	subtree: true,
});
