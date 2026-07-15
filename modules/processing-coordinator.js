(function installProcessingCoordinatorModule(globalScope) {
	"use strict";

	const MUTATION_DEBOUNCE_MS = 175;
	const MUTATION_IDLE_TIMEOUT_MS = 700;
	const STABLE_REPROCESS_INTERVAL_MS = 5000;
	const STARTUP_ATTEMPT_LIMIT = 10;
	const STARTUP_RETRY_DELAY_MS = 300;

	function create({
		cancelIdle = () => {},
		clearTimer = () => {},
		getLastReconciliation,
		getListingSignature,
		getProcessingState,
		hasInitialSignals,
		hasPotentialWork,
		isActive,
		now = () => Date.now(),
		reconcile,
		requestIdle = null,
		setTimer = (callback, delay) => setTimeout(callback, delay),
	}) {
		let debounceTimerId = null;
		let idleCallbackId = null;
		let pendingCards = new Set();
		let pendingFullScan = false;
		let startupAttempts = 0;
		let startupTimerId = null;

		function clearPendingMutations() {
			pendingCards = new Set();
			pendingFullScan = false;
		}

		function mergePendingCards(targetCards) {
			for (const card of pendingCards) targetCards.add(card);
			pendingCards = new Set();
			return targetCards;
		}

		function runMutationReconciliation({
			listingSetSignature,
			processingState,
			shouldForceFullScan,
			targetCards,
		}) {
			const runFullScan = shouldForceFullScan || pendingFullScan;
			if (runFullScan) clearPendingMutations();

			reconcile({
				listingSetSignature: runFullScan ? null : listingSetSignature,
				processingState,
				targetCards: runFullScan
					? null
					: mergePendingCards(targetCards || new Set()),
			});
		}

		function flushMutationRequest() {
			debounceTimerId = null;
			if (!isActive()) {
				clearPendingMutations();
				return;
			}

			const processingState = getProcessingState();
			if (!processingState.hasWork) {
				clearPendingMutations();
				return;
			}

			const shouldForceFullScan = pendingFullScan;
			pendingFullScan = false;
			const targetCards = shouldForceFullScan ? null : pendingCards;
			pendingCards = new Set();
			const hasTargetCards = targetCards?.size > 0;
			const listingSetSignature = hasTargetCards
				? null
				: getListingSignature();
			const lastReconciliation = getLastReconciliation();

			if (
				!shouldForceFullScan &&
				!hasTargetCards &&
				listingSetSignature === lastReconciliation.signature &&
				now() - lastReconciliation.completedAt < STABLE_REPROCESS_INTERVAL_MS
			) {
				return;
			}

			const run = () => {
				idleCallbackId = null;
				runMutationReconciliation({
					listingSetSignature,
					processingState,
					shouldForceFullScan,
					targetCards,
				});
			};

			if (requestIdle) {
				idleCallbackId = requestIdle(run, {
					timeout: MUTATION_IDLE_TIMEOUT_MS,
				});
			} else {
				run();
			}
		}

		function requestMutation({ cards, forceFullScan = false }) {
			if (forceFullScan) pendingFullScan = true;
			if (cards) {
				for (const card of cards) pendingCards.add(card);
			}
			if (debounceTimerId !== null || idleCallbackId !== null) return;

			debounceTimerId = setTimer(
				flushMutationRequest,
				MUTATION_DEBOUNCE_MS,
			);
		}

		function requestStartup() {
			if (
				startupTimerId !== null ||
				!isActive() ||
				!hasPotentialWork() ||
				hasInitialSignals() ||
				startupAttempts >= STARTUP_ATTEMPT_LIMIT
			) {
				return;
			}

			startupAttempts += 1;
			startupTimerId = setTimer(() => {
				startupTimerId = null;
				if (!isActive()) return;
				reconcile({
					listingSetSignature: null,
					processingState: null,
					targetCards: null,
				});
				requestStartup();
			}, STARTUP_RETRY_DELAY_MS);
		}

		function request({
			cards = null,
			cause,
			forceFullScan = false,
		} = {}) {
			if (cause === "mutation") {
				requestMutation({ cards, forceFullScan });
				return;
			}
			if (cause === "startup") {
				requestStartup();
				return;
			}

			reconcile({
				listingSetSignature: null,
				processingState: null,
				targetCards: null,
			});
		}

		function cancel() {
			if (debounceTimerId !== null) clearTimer(debounceTimerId);
			if (startupTimerId !== null) clearTimer(startupTimerId);
			if (idleCallbackId !== null) cancelIdle(idleCallbackId);
			debounceTimerId = null;
			idleCallbackId = null;
			startupTimerId = null;
			clearPendingMutations();
		}

		return Object.freeze({ cancel, request });
	}

	const modules = (globalScope.BetterFabModules ||= {});
	modules.processingCoordinator = Object.freeze({ create });
})(globalThis);
