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
	const toggleSellerFilter = document.getElementById("toggle-seller-filter");
	const toggleHideSellerButtons = document.getElementById(
		"toggle-hide-seller-buttons",
	);
	const toggleLibrarySeller = document.getElementById("toggle-library-seller");
	const toggleStarReviewSort = document.getElementById(
		"toggle-star-review-sort",
	);
	const minReviewsInput = document.getElementById("min-reviews-input");

	const sellerInput = document.getElementById("seller-input");
	const addSellerBtn = document.getElementById("add-seller-btn");
	const sellerList = document.getElementById("seller-list");

	const keywordInput = document.getElementById("keyword-input");
	const addKeywordBtn = document.getElementById("add-keyword-btn");
	const keywordList = document.getElementById("keyword-list");

	await chrome.storage.local.remove([
		"starSortModeSelector",
		"starSortModeMatch",
	]);

	let data = await chrome.storage.local.get([
		"filterActive",
		"hiddenSellers",
		"sellerFilterActive",
		"applySellerFilterInLibrary",
		"applySavedFilterOnSellerPage",
		"sortStarsByReviewCount",
		"showHideSellerButtons",
		"minimumReviewCount",
		"hiddenKeywords",
	]);

	let filterActive = data.filterActive !== false;
	let sellerFilterActive = data.sellerFilterActive !== false;
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

	toggleSaved.checked = filterActive;
	toggleSavedSellerPage.checked = applySavedFilterOnSellerPage;
	toggleSellerFilter.checked = sellerFilterActive;
	toggleHideSellerButtons.checked = showHideSellerButtons;
	toggleLibrarySeller.checked = applySellerFilterInLibrary;
	toggleStarReviewSort.checked = sortStarsByReviewCount;
	minReviewsInput.value = String(minimumReviewCount);
	renderList(sellerList, hiddenSellers, onSellerRemoved);
	renderList(keywordList, hiddenKeywords, onKeywordRemoved);

	async function broadcastUpdate() {
		const tabs = await chrome.tabs.query({ url: "*://*.fab.com/*" });
		for (const t of tabs) {
			chrome.tabs
				.sendMessage(t.id, {
					action: "update_filters",
					filterActive,
					hiddenSellers,
					sellerFilterActive,
					applySellerFilterInLibrary,
					applySavedFilterOnSellerPage,
					sortStarsByReviewCount,
					showHideSellerButtons,
					minimumReviewCount,
					hiddenKeywords,
				})
				.catch(() => {});
		}
	}

	async function updateStorage() {
		await chrome.storage.local.set({
			filterActive,
			hiddenSellers,
			sellerFilterActive,
			applySellerFilterInLibrary,
			applySavedFilterOnSellerPage,
			sortStarsByReviewCount,
			showHideSellerButtons,
			minimumReviewCount,
			hiddenKeywords,
		});
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

	toggleSellerFilter.addEventListener("change", async (e) => {
		sellerFilterActive = e.target.checked;
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
