// Thin client for the Lead Assist system API.
// All requests are made from the background service worker so host_permissions
// (not the page's CORS policy) govern access. Configure the base URL on the
// options page; the identity token lives in the gitignored config.local.js.

const DEFAULT_SETTINGS = {
  apiBaseUrl: "https://leadassist.ai/api/v1",
  // Sent as the X-Conversion-Identity-Token header (Passport token from the
  // ConversionIA Identity Server). NOT an Authorization: Bearer header.
  // Prefer setting this in config.local.js so it is never committed.
  identityToken: "",
  itemsPath: "/items",
  // Bulk import endpoints (one POST request per row is sent to these paths).
  usersPath: "/users",
  // {client} is replaced by the Client ID entered in the Client Status tab.
  statusPath: "/clients/{client}/statuses",
};

// Optional local overrides from config.local.js (gitignored). This is the
// recommended home for the identity token: copy config.example.js to
// config.local.js and fill it in. Missing file is fine — we fall back to
// options-page settings.
let localConfigPromise;
function getLocalConfig() {
  if (!localConfigPromise) {
    localConfigPromise = import("../config.local.js")
      .then((m) => m.default ?? {})
      .catch(() => ({}));
  }
  return localConfigPromise;
}

export async function getSettings() {
  const [local, stored] = await Promise.all([
    getLocalConfig(),
    chrome.storage.sync.get(null), // only keys the user explicitly saved
  ]);
  // Precedence: built-in defaults < config.local.js < options-page settings.
  const merged = { ...DEFAULT_SETTINGS, ...local, ...stored };
  // An empty stored token must not blank out a token set in config.local.js.
  if (!merged.identityToken && local.identityToken) {
    merged.identityToken = local.identityToken;
  }
  return merged;
}

export async function saveSettings(settings) {
  await chrome.storage.sync.set(settings);
}

export async function removeSetting(key) {
  await chrome.storage.sync.remove(key);
}

async function request(method, path, body) {
  const { apiBaseUrl, identityToken } = await getSettings();
  if (!apiBaseUrl) {
    throw new Error("API base URL is not configured. Open the extension options page.");
  }

  const url = apiBaseUrl.replace(/\/+$/, "") + path;
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  // ConversionIA Identity Server Passport token. This API does NOT use
  // Authorization: Bearer — the token goes in this custom header.
  if (identityToken) {
    headers["X-Conversion-Identity-Token"] = identityToken;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const detail = typeof data === "string" ? data : JSON.stringify(data);
    throw new Error(`API ${method} ${path} failed (${response.status}): ${detail}`);
  }
  return data;
}

export const api = {
  get: (path) => request("GET", path),
  post: (path, body) => request("POST", path, body),
  put: (path, body) => request("PUT", path, body),
  patch: (path, body) => request("PATCH", path, body),
  delete: (path) => request("DELETE", path),
};

// Convenience wrappers for the default "items" resource. Adjust itemsPath in
// settings (or these functions) to match your API's real endpoints.
export async function listItems() {
  const { itemsPath } = await getSettings();
  return api.get(itemsPath);
}

export async function createItem(item) {
  const { itemsPath } = await getSettings();
  return api.post(itemsPath, item);
}

export async function testConnection() {
  const { apiBaseUrl, itemsPath } = await getSettings();
  await api.get(itemsPath);
  return `Connected to ${apiBaseUrl}`;
}
