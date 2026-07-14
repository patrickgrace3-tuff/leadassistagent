// Background service worker: routes messages between the side panel, content
// scripts, and the Lead Assist system API.

import { api, listItems, createItem, testConnection } from "../lib/api-client.js";

// Clicking the toolbar icon opens the side panel for the current tab.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Message protocol: { type: string, ...payload }. Every handler returns a
// promise; the result is sent back as { ok: true, data } or { ok: false, error }.
const handlers = {
  // Generic API passthrough so the side panel can hit any endpoint:
  // { type: "api:request", method: "GET", path: "/leads", body?: {...} }
  "api:request": ({ method = "GET", path, body }) => {
    const fn = api[method.toLowerCase()];
    if (!fn) throw new Error(`Unsupported method: ${method}`);
    return fn(path, body);
  },

  "api:listItems": () => listItems(),

  "api:createItem": ({ item }) => createItem(item),

  "api:testConnection": () => testConnection(),

  // Ask the content script in the active tab for its page context.
  "page:read": async () => {
    const tab = await getActiveTab();
    return sendToTab(tab.id, { type: "page:read" });
  },

  // Highlight elements on the active page matching a CSS selector.
  "page:highlight": async ({ selector }) => {
    const tab = await getActiveTab();
    return sendToTab(tab.id, { type: "page:highlight", selector });
  },

  // Fill an input/textarea on the active page.
  "page:fill": async ({ selector, value }) => {
    const tab = await getActiveTab();
    return sendToTab(tab.id, { type: "page:fill", selector, value });
  },
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = handlers[message?.type];
  if (!handler) return false;

  Promise.resolve(handler(message, sender))
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
  return true; // keep the message channel open for the async response
});

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) throw new Error("No active tab found.");
  return tab;
}

async function sendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // Content script not present yet (e.g. tab opened before the extension
    // loaded). Inject it once, then retry.
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content/content-script.js"],
    });
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ["content/content-styles.css"],
    });
    return chrome.tabs.sendMessage(tabId, message);
  }
}
