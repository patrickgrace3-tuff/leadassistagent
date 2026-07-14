import { getSettings, saveSettings, removeSetting } from "../lib/api-client.js";

const $ = (id) => document.getElementById(id);

async function load() {
  const s = await getSettings();
  $("api-base-url").value = s.apiBaseUrl;
  $("items-path").value = s.itemsPath;
  $("users-path").value = s.usersPath;
  $("status-path").value = s.statusPath;

  // Token: show only a value saved here, not one coming from config.local.json,
  // so a blank field clearly means "using config.local.json (or none)".
  const stored = await chrome.storage.sync.get("identityToken");
  $("identity-token").value = stored.identityToken || "";
}

async function save() {
  await saveSettings({
    apiBaseUrl: $("api-base-url").value.trim(),
    itemsPath: $("items-path").value.trim() || "/items",
    usersPath: $("users-path").value.trim() || "/users",
    statusPath: $("status-path").value.trim() || "/clients/{client}/statuses",
  });

  // Blank token here → fall back to config.local.json rather than overriding it.
  const token = $("identity-token").value.trim();
  if (token) {
    await saveSettings({ identityToken: token });
  } else {
    await removeSetting("identityToken");
  }
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
