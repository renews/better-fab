const ICON_PATHS = {
  16: "logo16.png",
  48: "logo48.png",
  128: "logo128.png",
};
const BASE_ICON_BITMAPS = new Map();

async function loadBaseIcon(size) {
  const cached = BASE_ICON_BITMAPS.get(size);
  if (cached) return cached;

  const response = await fetch(chrome.runtime.getURL(ICON_PATHS[size]));
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  BASE_ICON_BITMAPS.set(size, bitmap);
  return bitmap;
}

async function drawStatusIcon(size, isActive) {
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext("2d");
  const icon = await loadBaseIcon(size);

  context.drawImage(icon, 0, 0, size, size);

  const radius = Math.max(2, Math.round(size * 0.14));
  const outline = Math.max(1, Math.round(size * 0.035));
  const padding = Math.max(1, Math.round(size * 0.12));
  const center = size - padding - radius;

  context.beginPath();
  context.arc(center, center, radius + outline, 0, Math.PI * 2);
  context.fillStyle = "rgba(255, 255, 255, 0.95)";
  context.fill();

  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.fillStyle = isActive ? "#00C853" : "#D32F2F";
  context.fill();

  return context.getImageData(0, 0, size, size);
}

async function getStatusIconImageData(isActive) {
  const entries = await Promise.all(
    Object.keys(ICON_PATHS).map(async (size) => [
      Number(size),
      await drawStatusIcon(Number(size), isActive),
    ]),
  );

  return Object.fromEntries(entries);
}

// Function to update the extension icon and title
async function updateBadge(isActive) {
  await chrome.action.setBadgeText({ text: "" });
  await chrome.action.setIcon({
    imageData: await getStatusIconImageData(isActive),
  });
  await chrome.action.setTitle({
    title: isActive ? "Better Fab: Active" : "Better Fab: Inactive",
  });
}

async function getExtensionState() {
  const data = await chrome.storage.local.get(["extensionActive", "filterActive"]);
  if (typeof data.extensionActive === "boolean") {
    return data.extensionActive;
  }

  return data.filterActive !== false;
}

async function setExtensionState(isActive) {
  await chrome.storage.local.set({ extensionActive: isActive });
  await updateBadge(isActive);

  const tabs = await chrome.tabs.query({ url: "*://*.fab.com/*" });
  for (const tab of tabs) {
    chrome.tabs
      .sendMessage(tab.id, {
        action: "update_state",
        extensionActive: isActive,
      })
      .catch(() => {});
  }
}

// On first load, check storage and update the icon
getExtensionState().then(updateBadge);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (!changes.extensionActive) return;

  updateBadge(Boolean(changes.extensionActive.newValue));
});

// Listener for browser icon clicks
chrome.action.onClicked.addListener(async () => {
  const currentState = await getExtensionState();
  await setExtensionState(!currentState);
});

// Listener for keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "_execute_action") {
    const currentState = await getExtensionState();
    await setExtensionState(!currentState);
  }
});
