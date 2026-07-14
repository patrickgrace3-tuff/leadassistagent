import { getSettings, saveSettings } from "../lib/api-client.js";

const $ = (id) => document.getElementById(id);

async function load() {
  const s = await getSettings();
  $("api-base-url").value = s.apiBaseUrl;
  $("identity-token").value = s.identityToken;
  $("items-path").value = s.itemsPath;
  $("users-path").value = s.usersPath;
  $("status-path").value = s.statusPath;
}

async function save() {
  await saveSettings({
    apiBaseUrl: $("api-base-url").value.trim(),
    identityToken: $("identity-token").value.trim(),
    itemsPath: $("items-path").value.trim() || "/items",
    usersPath: $("users-path").value.trim() || "/users",
    statusPath: $("status-path").value.trim() || "/clients/{client}/statuses",
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
