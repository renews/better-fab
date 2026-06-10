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
    "on-sale": false,
    "rated-4plus-3-reviews": false,
    "plugins-only": false,
  },
  extensionActive: true,
};

const STAR_SORT_INDICATOR = /rating|reviews?|stars?/i;
const STAR_SORT_QUERY_KEYS = [
  "sort",
  "sort_by",
  "orderby",
  "order_by",
  "sortorder",
];
const STAR_SORT_QUERY_FRAGMENT = "ratings.averagerating";
const THUMBNAIL_SELECTOR = ".fabkit-Thumbnail-root";
const PRODUCT_LINK_SELECTOR =
  'a[href^="/products/"], a[href*="://www.fab.com/products/"], a[href*="://fab.com/products/"]';
const LISTING_LINK_SELECTOR =
  'a[href^="/listings/"], a[href*="://www.fab.com/listings/"], a[href*="://fab.com/listings/"]';
const PRODUCT_OR_LISTING_LINK_SELECTOR = `${PRODUCT_LINK_SELECTOR}, ${LISTING_LINK_SELECTOR}`;
const IGNORE_SELLER_CARD_CLASS = "better-fab-ignore-seller-card";
const IGNORE_SELLER_BUTTON_CLASS = "better-fab-ignore-seller-btn";
const SELLER_PROFILE_CLASS = "better-fab-seller-profile";
const SELLER_PROFILE_AVERAGE_CLASS = "better-fab-seller-profile-average";
const SELLER_PROFILE_COUNT_CLASS = "better-fab-seller-profile-count";
const SELLER_PAGE_BUTTON_CLASS = "better-fab-seller-page-ignore-btn";
const SELLER_ROW_CLASS = "better-fab-seller-row";
const FAB_RATING_COUNT_PATTERN =
  /(?:^|[^\d.])([0-5](?:\.\d+)?)\s*\((\d{1,3}(?:[.,]\d{3})+|\d+(?:\.\d+)?\s*[kKmM]|\d+)\)/i;
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
  sale: /\b(?:\d{1,3}\s*%\s*off|on\s+sale|save\s+[\w\d%+.-]+\s*|\bdiscount\b|reduced|now\s+\$\s*\d|was\s+\$\s*\d|price.?dropped)\b/i,
  plugin: /\bplugins?\b|\bplug-?in\b/i,
  pluginPath:
    /\/(?:products?|listings)\/[^/?#]*plug(?:-?|_)?ins?[^/?#]*/i,
  pluginCategory: /\bplugin|plug-?in\b/i,
};
const LISTING_PLUGIN_CACHE = new Map();
const LISTING_PLUGIN_TEXT_MARKERS = [
  /\btools?\s*(?:&|&amp;|and)\s*plugins?\b/i,
  /\bplugin(s)?\b/i,
];

const FILTER_PRESETS = [
  {
    id: "no-ai",
    type: "exclude",
    matches: (metrics) =>
      PRESET_KEYWORDS.ai.some((pattern) => pattern.test(metrics.searchText)) ||
      PRESET_KEYWORDS.aiUrlOrLabel.test(metrics.searchText),
  },
  {
    id: "on-sale",
    type: "include",
    matches: (metrics) => PRESET_KEYWORDS.sale.test(metrics.searchText),
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
  {
    id: "plugins-only",
    type: "include",
    matches: async (metrics) => isPluginsOnlyMatch(metrics),
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
  const sanitized = values
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(sanitized)];
}

function sanitizePresetState(rawState) {
  const defaults = {
    "no-ai": false,
    "on-sale": false,
    "rated-4plus-3-reviews": false,
    "plugins-only": false,
  };

  if (!rawState || typeof rawState !== "object" || Array.isArray(rawState)) {
    return defaults;
  }

  return FILTER_PRESETS.reduce((state, preset) => {
    state[preset.id] = Boolean(rawState[preset.id]);
    return state;
  }, defaults);
}

function hasActivePreset(id) {
  return Boolean(config.activeFilterPresets?.[id]);
}

async function isHiddenByFilterPresets(metrics) {
  const includes = FILTER_PRESETS.filter(
    (preset) => preset.type === "include" && hasActivePreset(preset.id),
  );
  const excludes = FILTER_PRESETS.filter(
    (preset) => preset.type === "exclude" && hasActivePreset(preset.id),
  );

  for (const preset of excludes) {
    if (await preset.matches(metrics)) return true;
  }

  if (includes.length === 0) return false;

  for (const preset of includes) {
    const result = await preset.matches(metrics);
    if (!result) return true;
  }

  return false;
}

function getSellerLink(card) {
  return card.querySelector('a[href^="/sellers/"]');
}

function getSellerName(card) {
  const sellerLink = getSellerLink(card);
  if (!sellerLink) return "";
  return sellerLink.textContent.trim().toLowerCase();
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

function getCardText(card) {
  let text = card.textContent || "";

  const attrElements = card.querySelectorAll(
    "[aria-label], [title], [alt], [data-tip], [data-value], [data-type], [data-category], [data-kind], [data-item-type], [data-tags]",
  );

  attrElements.forEach((element) => {
    if (element.closest(`.${IGNORE_SELLER_BUTTON_CLASS}`)) return;

    ["aria-label", "title", "alt", "data-tip", "data-value"].forEach((attr) => {
      const value = element.getAttribute(attr);
      if (value) text += ` ${value}`;
    });
  });

  return text.toLowerCase();
}

function parseCountToken(value) {
  const raw = String(value || "").trim();
  const normalized = raw.replace(/,/g, "");
  const multiplier = /[kKmM]$/.test(normalized)
    ? /[kK]$/.test(normalized)
      ? 1000
      : 1000000
    : 1;
  const parsed = Number.parseFloat(normalized.replace(/[kKmM]/gi, ""));
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

function parseReviewCount(value) {
  const fabRatingCount = parseFabRatingCount(value);
  if (fabRatingCount) return fabRatingCount.reviewCount;

  const ratingCountMatch = value.match(
    /\b[0-5](?:\.\d+)?\s*\((\d{1,3}(?:[.,]\d{3})+|\d+(?:\.\d+)?\s*[kKmM]|\d+)\)/i,
  );
  const strictMatch = value.match(
    /(\d{1,3}(?:[.,]\d{3})+|\d+)\s*reviews?/i,
  );

  const compactMatch = value.match(
    /(\d+(?:\.\d+)?\s*[kKmM])\s*reviews?/i,
  );
  const ratingsMatch = value.match(
    /(\d{1,3}(?:[.,]\d{3})+|\d+)\s*ratings?/i,
  );
  const compactRatingsMatch = value.match(
    /(\d+(?:\.\d+)?\s*[kKmM])\s*ratings?/i,
  );

  const parenthesizedMatch = value.match(/\((\d{1,3}(?:[.,]\d{3})+|\d+)\s*reviews?\)/i);
  const fallbackMatch = value.match(
    /review[s]?\s*[:\-]?\s*(\d{1,3}(?:[.,]\d{3})+|\d+)/i,
  );

  const activeMatch =
    ratingCountMatch ||
    strictMatch ||
    compactMatch ||
    ratingsMatch ||
    compactRatingsMatch ||
    parenthesizedMatch ||
    fallbackMatch;
  if (!activeMatch) return null;

  return parseCountToken(activeMatch[1]);
}

function parseRating(value) {
  const fabRatingCount = parseFabRatingCount(value);
  if (fabRatingCount) return fabRatingCount.rating;

  const ratingPatterns = [
    /(?:^|\s|[^\d])([0-5](?:\.\d+)?)\s*\/\s*5\b/i,
    /([0-5](?:\.\d+)?)\s*(?:out of|of)\s*5\s*stars?/i,
    /([0-5](?:\.\d+)?)\s*stars?/i,
  ];

  for (const pattern of ratingPatterns) {
    const match = value.match(pattern);
    if (!match) continue;
    const parsed = Number.parseFloat(match[1]);
    if (!Number.isNaN(parsed)) return parsed;
  }

  return null;
}

function getCardFromListingNode(listingNode) {
  if (!listingNode) return null;

  if (listingNode.classList?.contains("fabkit-Thumbnail-root")) {
    let node = listingNode.parentElement;

    while (node && node !== document.body) {
      const thumbnailCount =
        node.querySelectorAll?.(THUMBNAIL_SELECTOR).length || 0;
      if (thumbnailCount === 1 && parseFabRatingCount(node.textContent || "")) {
        return node;
      }
      node = node.parentElement;
    }
    return listingNode.parentElement;
  }

  let node = listingNode;
  let attempts = 0;

  while (node && node !== document.body && attempts < 16) {
    const siblingLinks = node.querySelectorAll?.(PRODUCT_LINK_SELECTOR)
      .length || 0;
    const childThumbnails =
      node.querySelectorAll?.(THUMBNAIL_SELECTOR).length || 0;
    const hasText = (node.textContent || "").trim().length > 0;
    const isCardContainer = node.matches?.("article, section, li, div");

    if (
      hasText &&
      ((childThumbnails === 1 && parseFabRatingCount(node.textContent || "")) ||
        (siblingLinks === 1 && isCardContainer) ||
        node.matches?.(PRODUCT_LINK_SELECTOR))
    ) {
      if (node.matches?.(PRODUCT_LINK_SELECTOR)) return node.parentElement || node;
      return node;
    }

    node = node.parentElement;
    attempts += 1;
  }

  return listingNode.parentElement;
}

function getCardMetrics(card) {
  const cardText = getCardText(card);
  const productLink = card.querySelector(PRODUCT_OR_LISTING_LINK_SELECTOR);

  const getPathFromHref = (href) => {
    if (!href) return "";
    try {
      return new URL(href, window.location.origin).pathname.toLowerCase();
    } catch (err) {
      return "";
    }
  };

  const productPath = productLink?.getAttribute
    ? getPathFromHref(productLink.getAttribute("href"))
    : "";
  const pluginMetaText = (() => {
    const metaElements = card.querySelectorAll(
      "[aria-label], [title], [data-type], [data-category], [data-kind], [data-item-type], [data-tags]",
    );
    const metaParts = [];
    metaElements.forEach((element) => {
      [
        "aria-label",
        "title",
        "data-type",
        "data-category",
        "data-kind",
        "data-item-type",
        "data-tags",
      ].forEach((attribute) => {
        const attr = element.getAttribute(attribute);
        if (attr) metaParts.push(String(attr).toLowerCase());
      });

      if (element.textContent?.trim()) {
        metaParts.push(element.textContent.trim().toLowerCase());
      }
    });

    return metaParts.join(" ");
  })();

  return {
    sellerName: getSellerName(card),
    reviewCount: parseReviewCount(cardText),
    rating: parseRating(cardText),
    productPath,
    pluginMetaText,
    searchText: cardText,
  };
}

function isPluginsOnlyTextMatch(metrics) {
  return (
    PRESET_KEYWORDS.plugin.test(metrics.searchText) ||
    PRESET_KEYWORDS.pluginPath.test(metrics.productPath || "") ||
    PRESET_KEYWORDS.pluginCategory.test(metrics.pluginMetaText || "")
  );
}

function extractListingPath(metrics) {
  return normalizeListingPath(metrics.productPath || "");
}

function hasPluginMarkerInText(htmlText) {
  const normalizedText = String(htmlText || "").toLowerCase();
  return LISTING_PLUGIN_TEXT_MARKERS.some((pattern) =>
    pattern.test(normalizedText),
  );
}

async function isListingKnownToBePlugin(listingPath) {
  const normalizedPath = extractListingPath({ productPath: listingPath });
  if (!normalizedPath || !normalizedPath.startsWith("/listings/")) return false;

  const cached = LISTING_PLUGIN_CACHE.get(normalizedPath);
  if (cached !== undefined) return cached;

  const resolveCheck = (async () => {
    try {
      const response = await fetch(`${window.location.origin}${normalizedPath}`, {
        credentials: "include",
      });
      if (!response.ok) return false;

      const htmlText = await response.text();
      if (hasPluginMarkerInText(htmlText)) return true;

      try {
        const parsedDoc = new DOMParser().parseFromString(htmlText, "text/html");
        const titleText = parsedDoc.querySelector("title")?.textContent || "";
        if (hasPluginMarkerInText(titleText)) return true;
        return hasPluginMarkerInText(parsedDoc.body?.textContent || "");
      } catch (err) {
        return false;
      }
    } catch (err) {
      return false;
    }
  })();

  LISTING_PLUGIN_CACHE.set(normalizedPath, resolveCheck);
  const isPlugin = await resolveCheck;
  LISTING_PLUGIN_CACHE.set(normalizedPath, isPlugin);
  return isPlugin;
}

async function isPluginsOnlyMatch(metrics) {
  if (!metrics) return false;
  if (isPluginsOnlyTextMatch(metrics)) return true;

  if (!extractListingPath(metrics)) return false;
  return isListingKnownToBePlugin(extractListingPath(metrics));
}

function normalizeSortText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
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
  if (!config.minimumReviewCount || config.minimumReviewCount <= 0) return false;
  if (metrics.reviewCount === null) return true;
  return metrics.reviewCount < config.minimumReviewCount;
}

function hasHiddenKeywordMatch(metrics) {
  if (!config.hiddenKeywords.length) return false;
  return config.hiddenKeywords.some((keyword) =>
    metrics.searchText.includes(keyword),
  );
}

function setTextContent(element, value) {
  if (element && element.textContent !== value) element.textContent = value;
}

async function addSellerToIgnoreList(sellerName) {
  const normalizedSeller = String(sellerName || "").trim().toLowerCase();
  if (!normalizedSeller) return;

  const currentData = await chrome.storage.local.get("hiddenSellers");
  const nextHiddenSellers = sanitizeList([
    ...(currentData.hiddenSellers || []),
    normalizedSeller,
  ]);

  config.hiddenSellers = nextHiddenSellers;
  await chrome.storage.local.set({ hiddenSellers: nextHiddenSellers });
  void processItems();
}

function updateSellerPageIgnoreButton(button, sellerName) {
  const isIgnored = config.hiddenSellers.includes(sellerName);
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
  const ratedEntries = entries.filter((entry) => entry.metrics.rating !== null);
  const reviewedEntries = ratedEntries.filter(
    (entry) => entry.metrics.reviewCount !== null && entry.metrics.reviewCount > 0,
  );
  const totalReviews = reviewedEntries.reduce(
    (sum, entry) => sum + entry.metrics.reviewCount,
    0,
  );

  if (totalReviews > 0) {
    const weightedTotal = reviewedEntries.reduce(
      (sum, entry) => sum + entry.metrics.rating * entry.metrics.reviewCount,
      0,
    );

    return {
      average: weightedTotal / totalReviews,
      totalPackages,
      totalReviews,
      ratedPackages: reviewedEntries.length,
    };
  }

  if (ratedEntries.length) {
    const ratingTotal = ratedEntries.reduce(
      (sum, entry) => sum + entry.metrics.rating,
      0,
    );

    return {
      average: ratingTotal / ratedEntries.length,
      totalPackages,
      totalReviews: 0,
      ratedPackages: ratedEntries.length,
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

function ensureSellerProfile(isSellerPage, entries) {
  const existingProfile = document.querySelector(`.${SELLER_PROFILE_CLASS}`);

  if (!isSellerPage) {
    existingProfile?.remove();
    return;
  }

  const sellerName = getSellerNameFromPathname(window.location.pathname);
  if (!sellerName) {
    existingProfile?.remove();
    return;
  }

  const profile = existingProfile || createSellerProfile();
  const button = profile.querySelector(`.${SELLER_PAGE_BUTTON_CLASS}`);
  const averageElement = profile.querySelector(`.${SELLER_PROFILE_AVERAGE_CLASS}`);
  const countElement = profile.querySelector(`.${SELLER_PROFILE_COUNT_CLASS}`);
  const ratingSummary = getSellerRatingSummary(entries);

  button.dataset.seller = sellerName;
  button.hidden = !config.showHideSellerButtons;
  updateSellerPageIgnoreButton(button, sellerName);

  const averageText = ratingSummary.average === null
    ? "No ratings yet"
    : `${ratingSummary.average.toFixed(1)} / 5`;
  const reviewText = ratingSummary.totalReviews > 0
    ? `${formatCount(ratingSummary.totalReviews)} reviews`
    : "0 reviews";
  const packageText = ratingSummary.totalPackages === 1
    ? "1 package"
    : `${formatCount(ratingSummary.totalPackages)} packages`;
  const countText = `${reviewText} across ${packageText}`;

  setTextContent(averageElement, averageText);
  setTextContent(countElement, countText);

  const sellerItemsContainer = getSellerItemsContainer(entries);
  if (sellerItemsContainer?.parentElement) {
    sellerItemsContainer.parentElement.insertBefore(profile, sellerItemsContainer);
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
  card.classList.remove(IGNORE_SELLER_CARD_CLASS);
  card.querySelector(`.${IGNORE_SELLER_BUTTON_CLASS}`)?.remove();

  const sellerRow = card.querySelector(`.${SELLER_ROW_CLASS}`);
  if (!sellerRow || sellerRow.tagName !== "SPAN" || !sellerRow.parentElement)
    return;

  const parent = sellerRow.parentElement;
  while (sellerRow.firstChild) {
    parent.insertBefore(sellerRow.firstChild, sellerRow);
  }
  sellerRow.remove();
}

function ensureIgnoreSellerButton(card, sellerName) {
  const normalizedSeller = String(sellerName || "").trim().toLowerCase();
  const sellerLink = getSellerLink(card);
  const existingButton = card.querySelector(`.${IGNORE_SELLER_BUTTON_CLASS}`);

  if (!normalizedSeller || !sellerLink) {
    existingButton?.remove();
    card.classList.remove(IGNORE_SELLER_CARD_CLASS);
    return;
  }

  card.classList.add(IGNORE_SELLER_CARD_CLASS);
  const legacyRowParent = sellerLink.parentElement;
  if (
    legacyRowParent?.classList.contains(SELLER_ROW_CLASS) &&
    legacyRowParent.tagName !== "SPAN"
  ) {
    legacyRowParent.classList.remove(SELLER_ROW_CLASS);
  }

  let sellerRow = sellerLink.closest(`.${SELLER_ROW_CLASS}`);
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

function isConfiguredQueryMatchActive() {
  const exactModeMatch = normalizeSortText(config.starSortModeMatch || "");
  if (!exactModeMatch.includes("=")) return null;

  const currentParams = new URLSearchParams(window.location.search);
  try {
    const configuredParams = new URLSearchParams(exactModeMatch);
    for (const [key, value] of configuredParams.entries()) {
      const currentValue = currentParams.get(key);
      if (
        currentValue === null ||
        normalizeSortText(currentValue) !== normalizeSortText(value)
      ) {
        return false;
      }
    }
    return true;
  } catch (err) {
    return false;
  }
}

function isKnownStarSortQueryMode() {
  const queryParams = new URLSearchParams(window.location.search);

  for (const [key, value] of queryParams.entries()) {
    if (!STAR_SORT_QUERY_KEYS.includes(key.toLowerCase())) continue;
    if (normalizeSortText(value).includes(STAR_SORT_QUERY_FRAGMENT)) return true;
  }

  return false;
}

function isExplicitStarModeAlias(explicitModeMatch) {
  if (!explicitModeMatch) return false;

  if (/\b(5|five)\s*[- ]*\s*stars?\b/i.test(explicitModeMatch))
    return true;
  if (explicitModeMatch.includes(STAR_SORT_QUERY_FRAGMENT)) return true;

  if (
    explicitModeMatch.includes("min_average_rating=5") &&
    explicitModeMatch.includes("max_average_rating=5")
  ) {
    return true;
  }

  try {
    const configuredParams = new URLSearchParams(explicitModeMatch);
    const minRating = Number.parseFloat(
      configuredParams.get("min_average_rating"),
    );
    const maxRating = Number.parseFloat(
      configuredParams.get("max_average_rating"),
    );
    return Number.isFinite(minRating) && Number.isFinite(maxRating) &&
      minRating >= 5 && maxRating >= 5;
  } catch (err) {
    return false;
  }
}

function isStarSortActive() {
  const explicitMatchConfigured = normalizeSortText(config.starSortModeMatch || "");
  if (isKnownStarSortQueryMode()) return true;

  if (explicitMatchConfigured && explicitMatchConfigured.includes("=")) {
    if (isConfiguredQueryMatchActive() === true) return true;
    if (
      isExplicitStarModeAlias(explicitMatchConfigured) &&
      isKnownStarSortQueryMode()
    ) {
      return true;
    }
    return false;
  }

  if (config.starSortModeSelector) {
    const configuredSortMode = getConfiguredSortMode();
    if (!configuredSortMode) return isKnownStarSortQueryMode();
    if (!explicitMatchConfigured) {
      return STAR_SORT_INDICATOR.test(configuredSortMode) ||
        isKnownStarSortQueryMode();
    }

    return configuredSortMode.includes(explicitMatchConfigured) ||
      (
        isExplicitStarModeAlias(explicitMatchConfigured) &&
        isKnownStarSortQueryMode()
      );
  }

  return isKnownStarSortQueryMode();
}

function compareCardMetrics(a, b) {
  const ratingDiff = b.metrics.rating - a.metrics.rating;
  if (ratingDiff !== 0) return ratingDiff;

  if (a.metrics.rating === null && b.metrics.rating === null)
    return a.index - b.index;

  const aReviews =
    a.metrics.reviewCount === null ? -1 : a.metrics.reviewCount;
  const bReviews =
    b.metrics.reviewCount === null ? -1 : b.metrics.reviewCount;
  if (bReviews !== aReviews) return bReviews - aReviews;

  return a.index - b.index;
}

function applyStarReviewSort(entries) {
  const entriesByParent = new Map();

  entries.forEach((entry) => {
    const parent = entry.card.parentElement;
    if (!parent) return;
    if (!entriesByParent.has(parent)) entriesByParent.set(parent, []);
    entriesByParent.get(parent).push(entry);
  });

  entriesByParent.forEach((children) => {
    const sorted = [...children].sort(compareCardMetrics);
    if (sorted.length < 2) return;

    let changed = false;
    for (let i = 0; i < sorted.length; i += 1) {
      if (children[i]?.card !== sorted[i]?.card) {
        changed = true;
        break;
      }
    }

    if (!changed) return;

    sorted.forEach((entry) => {
      const parent = entry.card.parentElement;
      if (parent) parent.appendChild(entry.card);
    });
  });
}

function disableExtensionManipulations(listingNodes) {
  listingNodes.forEach((item) => {
    const card = getCardFromListingNode(item);
    if (!card) return;
    card.classList.remove("fab-hidden-item");
    removeIgnoreSellerButton(card);
  });

  const existingProfile = document.querySelector(`.${SELLER_PROFILE_CLASS}`);
  existingProfile?.remove();
}

async function processItems() {
  const pathname = window.location.pathname;
  const isHomePage = pathname === "/";
  const isLimitedTimeFreePage = pathname.startsWith("/limited-time-free");
  const isLibraryPage = pathname.startsWith("/library");
  const isSellerPage = pathname.startsWith("/sellers/");

  const shouldBypassFilters = isHomePage || isLimitedTimeFreePage;
  const listingNodes = document.querySelectorAll(
    `${THUMBNAIL_SELECTOR}, ${PRODUCT_LINK_SELECTOR}`,
  );
  const entries = [];
  const processedCards = new Set();

  if (!config.extensionActive) {
    disableExtensionManipulations(listingNodes);
    return;
  }

  for (const [index, item] of listingNodes.entries()) {
    if (!config.extensionActive) {
      disableExtensionManipulations(listingNodes);
      return;
    }

    const card = getCardFromListingNode(item);
    if (!card) continue;
    if (processedCards.has(card)) continue;
    processedCards.add(card);

    let shouldHide = false;
    const metrics = getCardMetrics(card);
    if (config.showHideSellerButtons) {
      ensureIgnoreSellerButton(card, metrics.sellerName);
    } else {
      removeIgnoreSellerButton(card);
    }

    if (!shouldBypassFilters) {
      let shouldRunSavedFilter = config.filterActive;
      if (isSellerPage && !config.applySavedFilterOnSellerPage) {
        shouldRunSavedFilter = false;
      }

      if (shouldRunSavedFilter) {
        const isSaved = card.querySelector(
          ".fabkit-Typography--intent-success .edsicon-check-circle-filled",
        );
        if (isSaved) shouldHide = true;
      }

      const shouldRunSellerFilter = !isSellerPage &&
        (!isLibraryPage || config.applySellerFilterInLibrary);

      if (!shouldHide && shouldRunSellerFilter) {
        if (config.hiddenSellers.includes(metrics.sellerName)) {
          shouldHide = true;
        } else if (hasHiddenKeywordMatch(metrics)) {
          shouldHide = true;
        }
      }

      if (!shouldHide && isMinimumReviewsFilterTriggered(metrics)) {
        shouldHide = true;
      }

      if (!shouldHide && (await isHiddenByFilterPresets(metrics))) {
        shouldHide = true;
      }
    }

    if (shouldHide) {
      card.classList.add("fab-hidden-item");
    } else {
      card.classList.remove("fab-hidden-item");
    }

    entries.push({
      card,
      metrics,
      index,
    });
  }

  ensureSellerProfile(isSellerPage, entries);

  if (config.sortStarsByReviewCount && isStarSortActive()) {
    applyStarReviewSort(entries);
  }
}

chrome.storage.local
  .get([
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
  ])
  .then((data) => {
    if (data.filterActive !== undefined) config.filterActive = data.filterActive;
    if (data.hiddenSellers !== undefined)
      config.hiddenSellers = sanitizeList(data.hiddenSellers);
    if (data.applySellerFilterInLibrary !== undefined)
      config.applySellerFilterInLibrary = data.applySellerFilterInLibrary;
    if (data.applySavedFilterOnSellerPage !== undefined)
      config.applySavedFilterOnSellerPage = data.applySavedFilterOnSellerPage;
    if (data.minimumReviewCount !== undefined)
      config.minimumReviewCount = Number.parseInt(data.minimumReviewCount, 10) || 0;
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
    }
    if (data.extensionActive !== undefined) {
      config.extensionActive = data.extensionActive;
    }
    void processItems();
  });

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === "update_filters") {
    config.filterActive = request.filterActive;
    config.hiddenSellers = sanitizeList(request.hiddenSellers);
    config.applySellerFilterInLibrary = request.applySellerFilterInLibrary;
    config.applySavedFilterOnSellerPage = request.applySavedFilterOnSellerPage;
    config.minimumReviewCount = Number.parseInt(request.minimumReviewCount, 10) || 0;
    config.hiddenKeywords = sanitizeList(request.hiddenKeywords);
    config.sortStarsByReviewCount = request.sortStarsByReviewCount;
    config.showHideSellerButtons = request.showHideSellerButtons !== false;
    config.activeFilterPresets = sanitizePresetState(request.activeFilterPresets);
    config.starSortModeSelector =
      typeof request.starSortModeSelector === "string"
        ? request.starSortModeSelector.trim()
        : "";
    config.starSortModeMatch =
      typeof request.starSortModeMatch === "string"
        ? request.starSortModeMatch.trim().toLowerCase()
        : "";
    if (typeof request.extensionActive === "boolean") {
      config.extensionActive = request.extensionActive;
    }
    void processItems();
  }

  if (request.action === "update_state") {
    if (typeof request.state === "boolean") {
      config.filterActive = request.state;
    }
    if (typeof request.extensionActive === "boolean") {
      config.extensionActive = request.extensionActive;
    }
    void processItems();
  }

});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes.hiddenSellers) {
    config.hiddenSellers = sanitizeList(changes.hiddenSellers.newValue);
  }
  if (changes.hiddenKeywords) {
    config.hiddenKeywords = sanitizeList(changes.hiddenKeywords.newValue);
  }
  if (changes.activeFilterPresets) {
    config.activeFilterPresets = sanitizePresetState(
      changes.activeFilterPresets.newValue,
    );
  }
  if (changes.extensionActive) {
    config.extensionActive = Boolean(changes.extensionActive.newValue);
  }
  if (
    !changes.hiddenSellers &&
    !changes.hiddenKeywords &&
    !changes.activeFilterPresets &&
    !changes.extensionActive
  )
    return;
  void processItems();
});

let debounceTimeout;
const observer = new MutationObserver(() => {
  clearTimeout(debounceTimeout);
  debounceTimeout = setTimeout(() => {
    void processItems();
  }, 100);
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});
