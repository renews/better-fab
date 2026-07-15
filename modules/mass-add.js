(function installMassAddModule(globalScope) {
	"use strict";

	const fabDom = globalScope.BetterFabModules?.fabDom;
	if (!fabDom) {
		throw new Error("Mass-Add requires the Fab DOM adapter");
	}

	const THUMBNAIL_SELECTOR = ".fabkit-Thumbnail-root";
	const PRODUCT_OR_LISTING_LINK_SELECTOR =
		'a[href*="/products/"], a[href*="/listings/"]';
	const LIBRARY_BUTTON_SELECTOR =
		"button, a[role='button'], [role='button'], [data-action], [data-testid], [data-test], a[href], [aria-label], [title]";
	const ADD_LIBRARY_ACTION_SELECTOR =
		"button, a, [role='button'], [data-action], [data-testid], [data-test], [aria-label], [title]";
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
		/\b0(?:[.,]\d{1,2})?\s*(?:usd|eur|gbp|aud|cad|nzd|brl|mxn|inr|jpy|krw|cny)\b/i,
		/[$£€¥₹]\s*0(?:[.,]\d{1,2})?\b/i,
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
	const CONFIRMED_LIBRARY_STATE_PATTERNS = [
		/\balready\s+in\s+library\b/i,
		/\bin\s+library\b/i,
		/\bsaved\b/i,
		/\bowned\b/i,
		/\bremove\s+from\s+library\b/i,
	];
	const SKIP_LIBRARY_BUTTON_PATTERNS = [
		/\badd\s+to\s+cart\b/i,
		...CONFIRMED_LIBRARY_STATE_PATTERNS,
	];
	const PRICE_ATTRIBUTE_SELECTOR = [
		"[data-price]",
		"[data-test='price']",
		"[data-qa='price']",
		"[data-testid*='price']",
		"[itemprop='price']",
	].join(", ");
	const LICENSE_MODAL_SELECTOR = 'div[role="dialog"][aria-modal="true"]';
	const LICENSE_MODAL_TITLE_SELECTOR = ".fabkit-Modal-title";
	const LICENSE_FORM_FIELD_SELECTOR = ".fabkit-FormField-root";
	const LICENSE_MODAL_ADD_BUTTON_SELECTOR = ".fabkit-Modal-actions button";
	const LICENSE_MODAL_CLOSE_SELECTOR = ".fabkit-Modal-closeButton";
	const LICENSE_ACTION_REVEAL_DELAY_MS = 120;
	const ADD_LIBRARY_PROXIMITY_RADIUS_PX = 260;
	const LICENSE_NO_MODAL_DEBOUNCE_MIN_MS = 50;
	const LICENSE_NO_MODAL_DEBOUNCE_MAX_MS = 150;
	const LICENSE_MODAL_WAIT_CLOSE_MAX_MS = 1200;
	const LIBRARY_CONFIRMATION_TIMEOUT_MS = 1500;

	function create({
		document,
		getCardMetrics,
		getSource,
		hasSavedItemMarker,
		isActive,
		notify,
		wait = (milliseconds) =>
			new Promise((resolve) => setTimeout(resolve, milliseconds)),
		window,
	}) {
		if (!document || !window || !getSource || !getCardMetrics) {
			throw new Error("Mass-Add requires its DOM and metrics adapters");
		}

		let running = false;

		function isSessionActive() {
			return running && isActive();
		}

		function hasFreePricePatternMatch(value) {
			const text = String(value || "");
			return FREE_PRICE_PATTERNS.some((pattern) => pattern.test(text));
		}

		function hasFreePriceFromCard(card, metrics) {
			for (const node of card.querySelectorAll(PRICE_ATTRIBUTE_SELECTOR)) {
				const content = String(
					node.getAttribute("content") ||
						node.getAttribute("value") ||
						node.getAttribute("data-price") ||
						node.textContent ||
						"",
				).toLowerCase();
				if (hasFreePricePatternMatch(content)) return true;
			}

			return /\b\$\s*0(?:[.,]\d{1,2})?\b|\bfree\b/.test(
				metrics.searchText || "",
			);
		}

		function randomDebounceDelayMs() {
			const range =
				LICENSE_NO_MODAL_DEBOUNCE_MAX_MS -
				LICENSE_NO_MODAL_DEBOUNCE_MIN_MS;
			return (
				LICENSE_NO_MODAL_DEBOUNCE_MIN_MS +
				Math.floor(Math.random() * (range + 1))
			);
		}

		function dispatchInteractionEvents(target) {
			if (!target) return;
			if (typeof target.focus === "function") {
				target.focus({ preventScroll: true });
			}

			const MouseEventConstructor = window.MouseEvent || globalScope.MouseEvent;
			if (typeof MouseEventConstructor !== "function") return;
			const rect = target.getBoundingClientRect();
			const clientX = Math.max(1, rect.left + Math.min(rect.width, 1) / 2);
			const clientY = Math.max(1, rect.top + Math.min(rect.height, 1) / 2);

			for (const type of LIBRARY_REVEAL_EVENT_TYPES) {
				target.dispatchEvent(
					new MouseEventConstructor(type, {
						bubbles: true,
						cancelable: true,
						clientX,
						clientY,
						view: window,
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
				if (
					rect.width > 0 &&
					rect.height > 0 &&
					typeof document.elementFromPoint === "function"
				) {
					for (const [x, y] of [
						[rect.left + rect.width / 2, rect.top + rect.height / 2],
						[rect.left + 4, rect.top + 4],
						[rect.right - 4, rect.top + 4],
						[rect.left + 4, rect.bottom - 4],
					]) {
						dispatchInteractionEvents(document.elementFromPoint(x, y));
					}
				}
				await wait(40);
			}

			await wait(LICENSE_ACTION_REVEAL_DELAY_MS);
		}

		function getVisibleLicenseModal() {
			for (const dialog of document.querySelectorAll(LICENSE_MODAL_SELECTOR)) {
				if (!dialog?.isConnected) continue;
				const rect = dialog.getBoundingClientRect();
				if (rect.width === 0 || rect.height === 0) continue;
				if (dialog.getAttribute("aria-hidden") === "true") continue;

				const titleElement = dialog.querySelector(
					LICENSE_MODAL_TITLE_SELECTOR,
				);
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
				await wait(60);
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
				await wait(60);
			}
		}

		function getPreferredLicenseInput(modal) {
			const fields = modal.querySelectorAll(LICENSE_FORM_FIELD_SELECTOR);
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

				const clickableTarget = label || field;
				const isFree =
					hasFreePricePatternMatch(optionText) ||
					hasFreePricePatternMatch(labelText);
				allCandidates.push({ input: clickableTarget, isFree });

				if (/\bprofessional\b/.test(labelText) && !professionalInput) {
					professionalInput = clickableTarget;
					professionalIsFree = isFree;
				} else if (/\bpersonal\b/.test(labelText) && !personalInput) {
					personalInput = clickableTarget;
					personalIsFree = isFree;
				}
			}

			if (personalInput && personalIsFree) return personalInput;
			if (professionalInput && professionalIsFree) return professionalInput;
			return allCandidates.find((candidate) => candidate.isFree)?.input || null;
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
				if (/add|save|confirm|checkout|get|accept/.test(text)) return button;
			}
			return actionButtons.length > 0
				? actionButtons[actionButtons.length - 1]
				: null;
		}

		function closeLicenseModal(modal) {
			const closeButton = modal.querySelector(
				`${LICENSE_MODAL_CLOSE_SELECTOR}, button[aria-label="Close"]`,
			);
			if (closeButton) {
				closeButton.click();
				return;
			}

			const KeyboardEventConstructor =
				window.KeyboardEvent || globalScope.KeyboardEvent;
			if (typeof KeyboardEventConstructor !== "function") return;
			window.dispatchEvent(
				new KeyboardEventConstructor("keydown", {
					bubbles: true,
					cancelable: true,
					key: "Escape",
					keyCode: 27,
				}),
			);
		}

		async function handleLicenseSelection() {
			const modal = await waitForLicenseModal();
			if (!modal) return { status: "none", hadModal: false, modal: null };
			if (!isSessionActive()) {
				closeLicenseModal(modal);
				return { status: "skipped", hadModal: true, modal };
			}

			let preferredInput = getPreferredLicenseInput(modal);
			for (let attempt = 0; !preferredInput && attempt < 15; attempt += 1) {
				await wait(100);
				preferredInput = getPreferredLicenseInput(modal);
			}
			if (!preferredInput || !isSessionActive()) {
				closeLicenseModal(modal);
				return { status: "skipped", hadModal: true, modal };
			}

			if (preferredInput.tagName !== "INPUT" || !preferredInput.checked) {
				preferredInput.click();
				await wait(50);
			}

			let addButton = getLicenseModalAddButton(modal);
			for (let attempt = 0; !addButton && attempt < 15; attempt += 1) {
				await wait(100);
				addButton = getLicenseModalAddButton(modal);
			}
			if (!addButton) {
				closeLicenseModal(modal);
				return { status: "skipped", hadModal: true, modal };
			}

			const endTime = Date.now() + 1200;
			while (addButton.disabled && Date.now() < endTime) {
				await wait(70);
				addButton = getLicenseModalAddButton(modal);
				if (!addButton) {
					closeLicenseModal(modal);
					return { status: "skipped", hadModal: true, modal };
				}
			}
			if (addButton.disabled || !isSessionActive()) {
				closeLicenseModal(modal);
				return { status: "skipped", hadModal: true, modal };
			}

			addButton.click();
			await wait(150);
			return { status: "added", hadModal: true, modal };
		}

		function matchesAny(text, patterns) {
			return patterns.some((pattern) => pattern.test(text));
		}

		function getCandidateText(element) {
			return String(
				`${element.textContent || ""} ${element.getAttribute("aria-label") || ""} ${
					element.title || ""
				}`,
			)
				.toLowerCase()
				.trim();
		}

		function clickWithoutMarketplaceNavigation(element) {
			const navigationLink = element.closest?.("a[href]");
			if (!fabDom.isMarketplaceNavigationLink(navigationLink)) {
				element.click();
				return;
			}

			const preventNavigation = (event) => event.preventDefault();
			element.addEventListener("click", preventNavigation, { once: true });
			try {
				element.click();
			} finally {
				element.removeEventListener("click", preventNavigation);
			}
		}

		function isAddLibraryCandidate(element, options = {}) {
			if (!element) return false;
			if (element.closest(".better-fab-ignore-seller-btn")) return false;
			if (element.getAttribute("aria-disabled") === "true" || element.disabled) {
				return false;
			}

			const requireStrictText = options.requireStrictText ?? true;
			const skipVisibilityCheck = options.skipVisibilityCheck === true;
			if (!skipVisibilityCheck && element.offsetParent === null) {
				const bounds = element.getBoundingClientRect();
				if (!bounds.width && !bounds.height) return false;
			}
			if (fabDom.isMarketplaceNavigationLink(element)) return false;

			const text = options.text ?? getCandidateText(element);
			if (!text || matchesAny(text, SKIP_LIBRARY_BUTTON_PATTERNS)) return false;
			if (!LIBRARY_ACTION_HINTS.test(text)) return false;
			return !requireStrictText || matchesAny(text, ADD_LIBRARY_TEXT_PATTERNS);
		}

		function getAddLibraryButton(card, options = {}) {
			for (const candidate of card.querySelectorAll(LIBRARY_BUTTON_SELECTOR)) {
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

			for (const candidate of document.querySelectorAll(
				ADD_LIBRARY_ACTION_SELECTOR,
			)) {
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
					distanceSquared <= maxDistanceSquared &&
					distanceSquared < closestDistanceSquared
				) {
					closestCandidate = candidate;
					closestDistanceSquared = distanceSquared;
				}
			}
			return closestCandidate;
		}

		async function findAddButtonForCard(card) {
			await revealCardActionControls(card);
			return (
				getAddLibraryButton(card) ||
				getAddLibraryButton(card, { skipVisibilityCheck: true }) ||
				findNearbyAddLibraryButton(card)
			);
		}

		async function ensureNoActiveModal(timeoutMs = 1500) {
			const endTime = Date.now() + timeoutMs;
			while (Date.now() < endTime) {
				if (!getVisibleLicenseModal()) return;
				await wait(90);
			}
		}

		function hasConfirmedLibraryState(card) {
			if (hasSavedItemMarker(card)) return true;
			for (const candidate of card.querySelectorAll(LIBRARY_BUTTON_SELECTOR)) {
				if (fabDom.isMarketplaceNavigationLink(candidate)) continue;
				if (
					matchesAny(
						getCandidateText(candidate),
						CONFIRMED_LIBRARY_STATE_PATTERNS,
					)
				) {
					return true;
				}
			}
			return false;
		}

		async function waitForLibraryConfirmation(
			card,
			timeoutMs = LIBRARY_CONFIRMATION_TIMEOUT_MS,
		) {
			const endTime = Date.now() + timeoutMs;
			do {
				if (hasConfirmedLibraryState(card)) return true;
				await wait(100);
			} while (Date.now() < endTime);
			return false;
		}

		async function processVisibleBatch(processedCards) {
			const source = getSource();
			const cards = [];
			for (const item of source.getListingNodes()) {
				const card = source.getCard(item);
				if (!card || processedCards.has(card)) continue;
				processedCards.add(card);
				if (card.classList.contains("fab-hidden-item")) continue;

				const rect = card.getBoundingClientRect();
				if (rect.width === 0 || rect.height === 0) continue;
				const metrics = getCardMetrics(card);
				if (
					!hasFreePricePatternMatch(metrics.searchText) &&
					!hasFreePriceFromCard(card, metrics)
				) {
					continue;
				}
				cards.push({ card });
			}

			cards.sort((left, right) => {
				const leftRect = left.card.getBoundingClientRect();
				const rightRect = right.card.getBoundingClientRect();
				return Math.abs(leftRect.top - rightRect.top) > 5
					? leftRect.top - rightRect.top
					: leftRect.left - rightRect.left;
			});

			const result = {
				attempted: 0,
				added: 0,
				alreadyInLibrary: 0,
				skipped: 0,
				noActionButton: 0,
			};

			for (const { card } of cards) {
				if (!isSessionActive()) break;
				await ensureNoActiveModal();
				if (!isSessionActive()) break;
				result.attempted += 1;

				if (hasConfirmedLibraryState(card)) {
					result.alreadyInLibrary += 1;
					continue;
				}

				const button = await findAddButtonForCard(card);
				if (!button) {
					result.noActionButton += 1;
					continue;
				}

				const label = getCandidateText(button);
				if (matchesAny(label, CONFIRMED_LIBRARY_STATE_PATTERNS)) {
					result.alreadyInLibrary += 1;
					continue;
				}
				if (matchesAny(label, SKIP_LIBRARY_BUTTON_PATTERNS)) {
					result.noActionButton += 1;
					continue;
				}

				try {
					button.scrollIntoView({
						behavior: "auto",
						block: "center",
						inline: "center",
					});
					await wait(70);
					if (!isSessionActive()) break;
					clickWithoutMarketplaceNavigation(button);

					const licenseResult = await handleLicenseSelection();
					if (licenseResult.hadModal) {
						await waitForLicenseModalToClose(licenseResult.modal);
					} else {
						await wait(randomDebounceDelayMs());
					}
					if (licenseResult.status === "skipped") {
						result.skipped += 1;
						continue;
					}

					if (await waitForLibraryConfirmation(card)) result.added += 1;
					else result.skipped += 1;
				} catch (_error) {
					result.skipped += 1;
				}
			}
			return result;
		}

		async function run() {
			if (running) return { error: "Already running" };
			running = true;
			const processedCards = new Set();
			const cumulative = {
				attempted: 0,
				added: 0,
				alreadyInLibrary: 0,
				skipped: 0,
				noActionButton: 0,
			};
			let noNewItemsCount = 0;

			try {
				while (isSessionActive()) {
					const batch = await processVisibleBatch(processedCards);
					for (const key of Object.keys(cumulative)) {
						cumulative[key] += batch[key];
					}
					if (!isSessionActive()) break;

					window.scrollTo({
						top: document.body.scrollHeight,
						behavior: "smooth",
					});
					await wait(2000);
					if (batch.attempted === 0) {
						noNewItemsCount += 1;
						if (noNewItemsCount >= 3) break;
						await wait(2000);
					} else {
						noNewItemsCount = 0;
					}
				}
			} finally {
				running = false;
			}

			notify(
				`The extension Better Fab says\n\n` +
					`Visible free items processed: ${cumulative.attempted}. Added: ${cumulative.added}. ` +
					`Already in library: ${cumulative.alreadyInLibrary}. Failed to click: ${cumulative.skipped}. ` +
					`No action button: ${cumulative.noActionButton}`,
			);
			return cumulative;
		}

		return Object.freeze({
			isRunning: () => running,
			run,
			stop() {
				running = false;
			},
		});
	}

	const modules = (globalScope.BetterFabModules ||= {});
	modules.massAdd = Object.freeze({ create });
})(globalThis);
