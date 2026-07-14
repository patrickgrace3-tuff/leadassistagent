import { getSettings, saveSettings } from "../lib/api-client.js";

const $ = (id) => document.getElementById(id);

async function load() {
  const s = await getSettings();
  $("api-base-url").value = s.apiBaseUrl;
  $("api-key").value = s.apiKey;
  $("items-path").value = s.itemsPath;
  $("users-path").value = s.usersPath;
  $("status-path").value = s.statusPath;
  $("status-field").value = s.statusField;
  $("status-options").value = s.statusOptions;
}

async function save() {
  await saveSettings({
    apiBaseUrl: $("api-base-url").value.trim(),
    apiKey: $("api-key").value.trim(),
    itemsPath: $("items-path").value.trim() || "/items",
    usersPath: $("users-path").value.trim() || "/users",
    statusPath: $("status-path").value.trim() || "/lead-statuses",
    statusField: $("status-field").value.trim() || "status",
    statusOptions: $("status-options").value.trim() || "New, Reapply",
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
