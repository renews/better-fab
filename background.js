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

// On first load, check storage and update the icon
chrome.storage.local.get("filterActive").then((data) => {
  const isActive = data.filterActive !== false;
  updateBadge(isActive);
});

// Listener for browser icon clicks
chrome.action.onClicked.addListener(async () => {
  const data = await chrome.storage.local.get("filterActive");
  const newState = !(data.filterActive !== false);

  await chrome.storage.local.set({ filterActive: newState });
  updateBadge(newState);

  const tabs = await chrome.tabs.query({ url: "*://*.fab.com/*" });
  for (const tab of tabs) {
    chrome.tabs
      .sendMessage(tab.id, { action: "update_state", state: newState })
      .catch(() => {});
  }
});

// Listener for keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "_execute_action") {
    const data = await chrome.storage.local.get("filterActive");
    const newState = !(data.filterActive !== false);

    await chrome.storage.local.set({ filterActive: newState });
    updateBadge(newState);

    const tabs = await chrome.tabs.query({ url: "*://*.fab.com/*" });
    for (const tab of tabs) {
      chrome.tabs
        .sendMessage(tab.id, { action: "update_state", state: newState })
        .catch(() => {});
    }
  }
});
