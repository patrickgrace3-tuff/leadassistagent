import { getSettings, saveSettings } from "../lib/api-client.js";

const $ = (id) => document.getElementById(id);

async function load() {
  const { apiBaseUrl, apiKey, itemsPath } = await getSettings();
  $("api-base-url").value = apiBaseUrl;
  $("api-key").value = apiKey;
  $("items-path").value = itemsPath;
}

async function save() {
  await saveSettings({
    apiBaseUrl: $("api-base-url").value.trim(),
    apiKey: $("api-key").value.trim(),
    itemsPath: $("items-path").value.trim() || "/items",
  });
  $("status").textContent = "Saved.";
}

$("save").addEventListener("click", save);

$("test").addEventListener("click", async () => {
  await save();
  $("status").textContent = "Testing connection…";
  const response = await chrome.runtime.sendMessage({ type: "api:testConnection" });
  $("status").textContent = response?.ok
    ? `✓ ${response.data}`
    : `✗ ${response?.error || "No response from background worker."}`;
});

load();
