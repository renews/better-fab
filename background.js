// Function to update the extension icon and title
async function updateBadge(isActive) {
  const text = isActive ? "ON" : "OFF";
  const color = isActive ? "#00C853" : "#555555";

  await chrome.action.setBadgeText({ text: text });
  await chrome.action.setBadgeBackgroundColor({ color: color });
  await chrome.action.setTitle({
    title: isActive ? "Better Fab: ON" : "Better Fab: OFF",
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
