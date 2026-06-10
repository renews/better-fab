document.addEventListener("DOMContentLoaded", async () => {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

	if (!tab.url || !tab.url.includes("fab.com")) {
		document.getElementById("app-content").style.display = "none";
		document.getElementById("wrong-site-message").style.display = "block";
		return;
	}

	const toggleSaved = document.getElementById("toggle-saved");
	const toggleSavedSellerPage = document.getElementById(
		"toggle-saved-seller-page",
	);
	const toggleHideSellerButtons = document.getElementById(
		"toggle-hide-seller-buttons",
	);
	const toggleLibrarySeller = document.getElementById("toggle-library-seller");
	const toggleStarReviewSort = document.getElementById(
		"toggle-star-review-sort",
	);
	const minReviewsInput = document.getElementById("min-reviews-input");
	const presetList = document.getElementById("preset-list");
	const extensionState = document.getElementById("extension-state");
	const addFreeLibraryBtn = document.getElementById("add-free-library-btn");
	const addFreeLibraryDefaultLabel = addFreeLibraryBtn
		? addFreeLibraryBtn.textContent
		: "Add visible free items to library";
	let isAddingVisibleFreeItems = false;

	const PRESET_DEFINITIONS = [
		{ id: "no-ai", label: "No AI-generated content" },
		{ id: "rated-4plus-3-reviews", label: "4★+ with 3+ reviews" },
	];

	const PRESET_STORAGE_DEFAULTS = PRESET_DEFINITIONS.reduce(
		(acc, preset) => ({ ...acc, [preset.id]: false }),
		{},
	);

	const sellerInput = document.getElementById("seller-input");
	const addSellerBtn = document.getElementById("add-seller-btn");
	const sellerList = document.getElementById("seller-list");

	const keywordInput = document.getElementById("keyword-input");
	const addKeywordBtn = document.getElementById("add-keyword-btn");
	const keywordList = document.getElementById("keyword-list");

	const presetControls = [
		toggleSaved,
		toggleSavedSellerPage,
		toggleHideSellerButtons,
		toggleLibrarySeller,
		toggleStarReviewSort,
		sellerInput,
		addSellerBtn,
		keywordInput,
		addKeywordBtn,
		sellerList,
		keywordList,
	];

	await chrome.storage.local.remove([
		"starSortModeSelector",
		"starSortModeMatch",
	]);

	let data = await chrome.storage.local.get([
		"filterActive",
		"hiddenSellers",
		"applySellerFilterInLibrary",
		"applySavedFilterOnSellerPage",
		"sortStarsByReviewCount",
		"showHideSellerButtons",
		"minimumReviewCount",
		"hiddenKeywords",
		"activeFilterPresets",
		"extensionActive",
	]);

	let filterActive = data.filterActive !== false;
	let applySellerFilterInLibrary = data.applySellerFilterInLibrary === true;
	let applySavedFilterOnSellerPage =
		data.applySavedFilterOnSellerPage !== false;
	let sortStarsByReviewCount = data.sortStarsByReviewCount === true;
	let showHideSellerButtons = data.showHideSellerButtons !== false;
	let minimumReviewCount = Number.isFinite(
		Number.parseInt(data.minimumReviewCount, 10),
	)
		? Number.parseInt(data.minimumReviewCount, 10)
		: 0;
	let hiddenSellers = data.hiddenSellers || [];
	let hiddenKeywords = data.hiddenKeywords || [];
	let activeFilterPresets = sanitizePresetState(data.activeFilterPresets);
	let extensionActive =
		typeof data.extensionActive === "boolean"
			? data.extensionActive
			: data.filterActive !== false;

	toggleSaved.checked = filterActive;
	toggleSavedSellerPage.checked = applySavedFilterOnSellerPage;
	toggleHideSellerButtons.checked = showHideSellerButtons;
	toggleLibrarySeller.checked = applySellerFilterInLibrary;
	toggleStarReviewSort.checked = sortStarsByReviewCount;
	minReviewsInput.value = String(minimumReviewCount);
	renderPresetList();
	renderList(sellerList, hiddenSellers, onSellerRemoved);
	renderList(keywordList, hiddenKeywords, onKeywordRemoved);
	const applyPresetBtn = document.getElementById("apply-presets-btn");
	const disablePresetBtn = document.getElementById("disable-presets-btn");
	presetControls.push(applyPresetBtn, disablePresetBtn);
	setExtensionButtons(extensionActive);

	async function broadcastUpdate() {
		const tabs = await chrome.tabs.query({ url: "*://*.fab.com/*" });
		for (const t of tabs) {
			chrome.tabs
					.sendMessage(t.id, {
						action: "update_filters",
						filterActive,
						hiddenSellers,
						applySellerFilterInLibrary,
					applySavedFilterOnSellerPage,
					sortStarsByReviewCount,
					showHideSellerButtons,
					minimumReviewCount,
					hiddenKeywords,
					activeFilterPresets,
					extensionActive,
				})
				.catch(() => {});
		}
	}

	async function updateStorage() {
		await chrome.storage.local.set({
			filterActive,
			hiddenSellers,
			applySellerFilterInLibrary,
			applySavedFilterOnSellerPage,
			sortStarsByReviewCount,
			showHideSellerButtons,
			minimumReviewCount,
			hiddenKeywords,
			activeFilterPresets,
			extensionActive,
		});
	}

	function setExtensionButtons(isActive) {
		applyPresetBtn.disabled = isActive;
		disablePresetBtn.disabled = !isActive;
		extensionState.textContent = isActive
			? "Extension: Active"
			: "Extension: Inactive";
		extensionState.classList.toggle("active", isActive);
		extensionState.classList.toggle("inactive", !isActive);
	}

	function renderList(listElement, items, onRemove) {
		listElement.innerHTML = "";
		items.forEach((item) => {
			const li = document.createElement("li");
			li.textContent = item;

			const removeBtn = document.createElement("button");
			removeBtn.textContent = "X";
			removeBtn.className = "remove-btn";
			removeBtn.onclick = async () => {
				await onRemove(item);
				await updateStorage();
				if (listElement === sellerList) {
					renderList(sellerList, hiddenSellers, onSellerRemoved);
				} else {
					renderList(keywordList, hiddenKeywords, onKeywordRemoved);
				}
				await broadcastUpdate();
			};

			li.appendChild(removeBtn);
			listElement.appendChild(li);
		});
	}

	function setAddLibraryButtonState(isRunning) {
		if (!addFreeLibraryBtn) return;
		addFreeLibraryBtn.disabled = isRunning;
		addFreeLibraryBtn.setAttribute("aria-disabled", String(Boolean(isRunning)));
		addFreeLibraryBtn.style.pointerEvents = isRunning ? "none" : "";
		addFreeLibraryBtn.textContent = isRunning
			? "Adding..."
			: addFreeLibraryDefaultLabel;

		for (const control of presetControls) {
			if (!control) continue;
			if (isRunning && control.id === "disable-presets-btn") continue;
			control.disabled = isRunning;
		}

		if (!presetList) return;
		const presetInputs = presetList.querySelectorAll("input");
		presetInputs.forEach((input) => {
			input.disabled = isRunning;
		});
	}

	const addVisibleFreeItemsToLibrary = async () => {
		if (!addFreeLibraryBtn || isAddingVisibleFreeItems) return;

		isAddingVisibleFreeItems = true;
		setAddLibraryButtonState(true);
		if (addFreeLibraryBtn.disabled !== true || addFreeLibraryBtn.style.pointerEvents !== "none") {
			addFreeLibraryBtn.disabled = true;
			addFreeLibraryBtn.style.pointerEvents = "none";
		}

		try {
			const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
			if (!tab.id) {
				alert("No active Fab tab found.");
				return;
			}

			const result = await chrome.tabs.sendMessage(tab.id, {
				action: "add_free_library",
			});

			if (!result) {
				alert("Could not communicate with the page script. Please refresh the page.");
				return;
			}

			if (!result.ok) {
				alert(`Unable to add items: ${result.error || "unknown error"}`);
				return;
			}

			alert(
				`Visible free items processed: ${result.attempted}. ` +
					`Added: ${result.added}. Already in library: ${result.alreadyInLibrary}. ` +
					`Failed to click: ${result.skipped || 0}. No action button: ${result.noActionButton || 0}`,
			);
		} catch (err) {
			alert("Could not trigger adding free items. Open Fab tab and try again.");
		} finally {
			isAddingVisibleFreeItems = false;
			setAddLibraryButtonState(false);
			addFreeLibraryBtn.style.pointerEvents = "";
		}
	};

	function sanitizePresetState(rawState) {
		const sanitized = { ...PRESET_STORAGE_DEFAULTS };
		if (!rawState || typeof rawState !== "object" || Array.isArray(rawState))
			return sanitized;

		PRESET_DEFINITIONS.forEach((preset) => {
			sanitized[preset.id] = Boolean(rawState[preset.id]);
		});

		return sanitized;
	}

	function renderPresetList() {
		presetList.innerHTML = "";
		PRESET_DEFINITIONS.forEach((preset) => {
			const row = document.createElement("label");
			row.className = "toggle-row preset-row";

			const label = document.createElement("span");
			label.textContent = preset.label;

			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			checkbox.checked = activeFilterPresets[preset.id];
			checkbox.addEventListener("change", async (e) => {
				activeFilterPresets[preset.id] = e.target.checked;
				await updateStorage();
				await broadcastUpdate();
			});

		row.append(label, checkbox);
		presetList.appendChild(row);
	});
	}

	async function applyPresetSelection() {
		extensionActive = true;
		await updateStorage();
		await broadcastUpdate();
		setExtensionButtons(extensionActive);
	}

	async function clearPresetSelection() {
		extensionActive = false;
		await updateStorage();
		setExtensionButtons(extensionActive);
		await broadcastUpdate();
	}

	applyPresetBtn.addEventListener("click", applyPresetSelection);
	disablePresetBtn.addEventListener("click", clearPresetSelection);
	if (addFreeLibraryBtn) {
		addFreeLibraryBtn.addEventListener(
			"click",
			(event) => {
				if (isAddingVisibleFreeItems) {
					event.preventDefault();
					event.stopImmediatePropagation();
					return;
				}
				void addVisibleFreeItemsToLibrary();
			},
			true,
		);
	}

	async function onSellerRemoved(seller) {
		hiddenSellers = hiddenSellers.filter((s) => s !== seller);
	}

	async function onKeywordRemoved(keyword) {
		hiddenKeywords = hiddenKeywords.filter((k) => k !== keyword);
	}

	function onInvalidSellerInput() {
		alert('Invalid seller name. Enter text like "Test Vendor".');
	}

	const exportSellersBtn = document.getElementById("export-sellers-btn");
	const importSellersBtn = document.getElementById("import-sellers-btn");
	const sellerImportFile = document.getElementById("seller-import-file");
	const exportKeywordsBtn = document.getElementById("export-keywords-btn");
	const importKeywordsBtn = document.getElementById("import-keywords-btn");
	const keywordImportFile = document.getElementById("keyword-import-file");

	function exportWithAnchor(dataStr, filename) {
		const blob = new Blob([dataStr], {
			type: "text/plain;charset=utf-8",
		});
		const objectUrl = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = objectUrl;
		a.download = filename;
		a.style.display = "none";
		document.body.appendChild(a);
		a.click();
		a.remove();

		setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
	}

	async function exportList(items, filename, label) {
		if (items.length === 0) {
			alert(`No ${label} to export.`);
			return;
		}

		const dataStr = `${items.join("\n")}\n`;
		const dataUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(
			dataStr,
		)}`;

		if (chrome.downloads?.download) {
			try {
				await chrome.downloads.download({
					url: dataUrl,
					filename,
					saveAs: true,
				});
				return;
			} catch (err) {
				exportWithAnchor(dataStr, filename);
				return;
			}
		}

		exportWithAnchor(dataStr, filename);
	}

	function parseImportValues(rawValue) {
		const trimmedValue = String(rawValue || "").trim();
		if (!trimmedValue) return [];

		if (trimmedValue.startsWith("[")) {
			const importedData = JSON.parse(trimmedValue);
			if (!Array.isArray(importedData)) {
				throw new Error("Invalid file format. Expected one item per line.");
			}

			return importedData
				.map((value) => String(value).trim().toLowerCase())
				.filter(Boolean);
		}

		return trimmedValue
			.split(/\r?\n/)
			.map((value) => value.trim().toLowerCase())
			.filter(Boolean);
	}

	function setupImport(input, onImport) {
		input.addEventListener("change", (e) => {
			const file = e.target.files[0];
			if (!file) return;

			const reader = new FileReader();

			reader.onload = async (event) => {
				try {
					await onImport(parseImportValues(event.target.result));
				} catch (err) {
					alert(
						err.message || "Error reading file. Make sure it is valid JSON.",
					);
				} finally {
					input.value = "";
				}
			};

			reader.readAsText(file);
		});
	}

	exportSellersBtn.addEventListener("click", async () => {
		await exportList(hiddenSellers, "better_fab_hidden_sellers.txt", "sellers");
	});

	importSellersBtn.addEventListener("click", () => {
		sellerImportFile.click();
	});

	setupImport(sellerImportFile, async (cleanImport) => {
		hiddenSellers = [...new Set([...hiddenSellers, ...cleanImport])];
		await updateStorage();
		renderList(sellerList, hiddenSellers, onSellerRemoved);
		await broadcastUpdate();
	});

	exportKeywordsBtn.addEventListener("click", async () => {
		await exportList(
			hiddenKeywords,
			"better_fab_hidden_keywords.txt",
			"keywords",
		);
	});

	importKeywordsBtn.addEventListener("click", () => {
		keywordImportFile.click();
	});

	setupImport(keywordImportFile, async (cleanImport) => {
		hiddenKeywords = [...new Set([...hiddenKeywords, ...cleanImport])];
		await updateStorage();
		renderList(keywordList, hiddenKeywords, onKeywordRemoved);
		await broadcastUpdate();
	});

	toggleSaved.addEventListener("change", async (e) => {
		filterActive = e.target.checked;
		await updateStorage();
		await broadcastUpdate();
	});

	toggleSavedSellerPage.addEventListener("change", async (e) => {
		applySavedFilterOnSellerPage = e.target.checked;
		await updateStorage();
		await broadcastUpdate();
	});

	toggleHideSellerButtons.addEventListener("change", async (e) => {
		showHideSellerButtons = e.target.checked;
		await updateStorage();
		await broadcastUpdate();
	});

	toggleLibrarySeller.addEventListener("change", async (e) => {
		applySellerFilterInLibrary = e.target.checked;
		await updateStorage();
		await broadcastUpdate();
	});

	toggleStarReviewSort.addEventListener("change", async (e) => {
		sortStarsByReviewCount = e.target.checked;
		await updateStorage();
		await broadcastUpdate();
	});

	chrome.storage.onChanged.addListener((changes, areaName) => {
		if (areaName !== "local") return;
		if (changes.extensionActive) {
			extensionActive = Boolean(changes.extensionActive.newValue);
			setExtensionButtons(extensionActive);
		}
	});

	minReviewsInput.addEventListener("change", async () => {
		const nextValue = Number.parseInt(minReviewsInput.value, 10);
		minimumReviewCount = Number.isFinite(nextValue)
			? Math.max(0, nextValue)
			: 0;
		minReviewsInput.value = String(minimumReviewCount);
		await updateStorage();
		await broadcastUpdate();
	});

	addSellerBtn.addEventListener("click", async () => {
		const sellerName = sellerInput.value.trim().toLowerCase();
		if (!sellerName) {
			return onInvalidSellerInput();
		}

		if (!hiddenSellers.includes(sellerName)) {
			hiddenSellers.push(sellerName);
			hiddenSellers = [...new Set(hiddenSellers)];
			sellerInput.value = "";
			await updateStorage();
			renderList(sellerList, hiddenSellers, onSellerRemoved);
			await broadcastUpdate();
		}
	});

	sellerInput.addEventListener("keypress", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			addSellerBtn.click();
		}
	});

	addKeywordBtn.addEventListener("click", async () => {
		const keyword = keywordInput.value.trim().toLowerCase();
		if (!keyword) return;

		if (!hiddenKeywords.includes(keyword)) {
			hiddenKeywords.push(keyword);
			hiddenKeywords = [...new Set(hiddenKeywords)];
			keywordInput.value = "";
			await updateStorage();
			renderList(keywordList, hiddenKeywords, onKeywordRemoved);
			await broadcastUpdate();
		}
	});

	keywordInput.addEventListener("keypress", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			addKeywordBtn.click();
		}
	});
});
