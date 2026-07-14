// Side panel UI. All privileged work (API calls, tab access) happens in the
// background service worker; this file only sends messages and renders results.

import { getSettings } from "../lib/api-client.js";
import { parseTable, buildBody, toCSV } from "../lib/csv.js";

const $ = (id) => document.getElementById(id);

let lastPageContext = null;

function log(message) {
  const el = $("log");
  const time = new Date().toLocaleTimeString();
  el.textContent = `[${time}] ${message}\n` + el.textContent;
}

function setStatus(ok, text) {
  $("status-dot").className = `dot ${ok ? "ok" : "err"}`;
  $("status-text").textContent = text;
}

async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response) throw new Error("No response from background worker.");
  if (!response.ok) throw new Error(response.error);
  if (response.data && response.data.error) throw new Error(response.data.error);
  return response.data;
}

// --- Tabs ---

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    const name = btn.dataset.tab;
    document.querySelectorAll(".tab").forEach((b) =>
      b.classList.toggle("active", b === btn)
    );
    document.querySelectorAll(".tab-panel").forEach((p) =>
      p.classList.toggle("active", p.dataset.panel === name)
    );
  });
});

// --- Connection ---

$("test-connection").addEventListener("click", async () => {
  setStatus(false, "Connecting…");
  try {
    const msg = await send({ type: "api:testConnection" });
    setStatus(true, msg);
    log(msg);
  } catch (err) {
    setStatus(false, "Connection failed");
    log(`Connection failed: ${err.message}`);
  }
});

$("open-options").addEventListener("click", () => chrome.runtime.openOptionsPage());

// --- Bulk import engine (shared by Users and Client Status tabs) ---

function renderPreview(el, headers, rows) {
  el.textContent = "";
  if (rows.length === 0) {
    el.innerHTML = '<p class="muted">No rows found.</p>';
    return;
  }

  const table = document.createElement("table");
  const thead = table.createTHead().insertRow();
  headers.forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    thead.appendChild(th);
  });

  const tbody = table.createTBody();
  rows.slice(0, 8).forEach((row) => {
    const tr = tbody.insertRow();
    headers.forEach((h) => {
      tr.insertCell().textContent = row[h] ?? "";
    });
  });
  el.appendChild(table);

  const summary = document.createElement("p");
  summary.className = "muted";
  summary.textContent =
    rows.length > 8
      ? `Showing 8 of ${rows.length} rows.`
      : `${rows.length} row(s).`;
  el.appendChild(summary);
}

async function runImport(rows, path, progressEl, resultEl, noun) {
  const bar = progressEl.firstElementChild;
  progressEl.classList.remove("hidden");
  resultEl.textContent = "";

  let ok = 0;
  const errors = [];
  const failedRows = [];

  for (let i = 0; i < rows.length; i++) {
    const body = buildBody(rows[i]);
    try {
      await send({ type: "api:request", method: "POST", path, body });
      ok++;
    } catch (err) {
      errors.push({ row: i + 2, error: err.message }); // +2: header row + 1-index
      failedRows.push({ ...rows[i], _error: err.message });
    }
    bar.style.width = `${Math.round(((i + 1) / rows.length) * 100)}%`;
  }

  const failed = errors.length;
  resultEl.innerHTML =
    `<p class="${failed ? "warn" : "success"}">` +
    `Imported ${ok}/${rows.length} ${noun}` +
    (failed ? `, ${failed} failed.` : ".") +
    `</p>`;
  errors.slice(0, 10).forEach((e) => {
    const p = document.createElement("p");
    p.className = "err-line";
    p.textContent = `Row ${e.row}: ${e.error}`;
    resultEl.appendChild(p);
  });
  log(`Import complete: ${ok} ok, ${failed} failed (${path}).`);
  return { ok, failed, failedRows };
}

// Trigger a client-side download of the given CSV text.
function downloadCSV(filename, csv) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Wire up one bulk tab. `getPath` returns the endpoint for this run; `validate`
// (optional) returns an error string to block the import, or null to proceed.
function setupBulkTab({ prefix, getPath, noun, validate }) {
  const fileInput = $(`${prefix}-file`);
  const pasteBox = $(`${prefix}-paste`);
  const parseBtn = $(`${prefix}-parse`);
  const previewEl = $(`${prefix}-preview`);
  const importBtn = $(`${prefix}-import`);
  const progressEl = $(`${prefix}-progress`);
  const resultEl = $(`${prefix}-result`);
  const downloadBtn = $(`${prefix}-download`);

  let parsed = { headers: [], rows: [] };
  let lastFailed = null; // { headers, rows } of the most recent failed rows

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    pasteBox.value = await file.text();
    log(`Loaded ${file.name} (${file.size} bytes).`);
  });

  parseBtn.addEventListener("click", () => {
    parsed = parseTable(pasteBox.value);
    renderPreview(previewEl, parsed.headers, parsed.rows);
    importBtn.disabled = parsed.rows.length === 0;
    downloadBtn.classList.add("hidden");
  });

  downloadBtn.addEventListener("click", () => {
    if (!lastFailed) return;
    downloadCSV(`${prefix}-failed-rows.csv`, toCSV(lastFailed.rows, lastFailed.headers));
  });

  importBtn.addEventListener("click", async () => {
    if (parsed.rows.length === 0) return;
    const problem = validate ? validate() : null;
    if (problem) {
      resultEl.innerHTML = `<p class="warn">${problem}</p>`;
      return;
    }
    importBtn.disabled = true;
    downloadBtn.classList.add("hidden");
    progressEl.classList.remove("hidden");
    progressEl.firstElementChild.style.width = "0%";
    try {
      const path = await getPath();
      const result = await runImport(parsed.rows, path, progressEl, resultEl, noun);
      if (result.failedRows.length > 0) {
        lastFailed = {
          headers: [...parsed.headers, "_error"],
          rows: result.failedRows,
        };
        downloadBtn.classList.remove("hidden");
      }
    } catch (err) {
      resultEl.innerHTML = `<p class="warn">Import failed: ${err.message}</p>`;
      log(`Import failed: ${err.message}`);
    } finally {
      importBtn.disabled = false;
    }
  });
}

setupBulkTab({
  prefix: "users",
  noun: "users",
  getPath: async () => (await getSettings()).usersPath,
});

setupBulkTab({
  prefix: "status",
  noun: "statuses",
  validate: () =>
    $("status-client-id").value.trim() ? null : "Enter a Client ID first.",
  getPath: async () => {
    const { statusPath } = await getSettings();
    const clientId = $("status-client-id").value.trim();
    return statusPath.replace("{client}", encodeURIComponent(clientId));
  },
});

// Show which endpoints the bulk tabs will hit, from saved settings.
async function loadSettingsIntoUI() {
  const s = await getSettings();
  $("users-endpoint").textContent = `POST ${s.apiBaseUrl}${s.usersPath}`;
  $("status-endpoint").textContent = `POST ${s.apiBaseUrl}${s.statusPath}`;
}
loadSettingsIntoUI();
// Reflect option changes made in the settings tab without reopening the panel.
chrome.storage.onChanged.addListener(loadSettingsIntoUI);

// --- Active page ---

$("read-page").addEventListener("click", async () => {
  try {
    const ctx = await send({ type: "page:read" });
    lastPageContext = ctx;
    $("page-title").textContent = ctx.title || "—";
    $("page-url").textContent = ctx.url || "—";
    $("page-selection").textContent = ctx.selection || "—";
    $("page-emails").textContent = ctx.emails.join(", ") || "—";
    $("page-phones").textContent = ctx.phones.join(", ") || "—";
    $("page-context").classList.remove("hidden");
    log(`Read page: ${ctx.title}`);
  } catch (err) {
    log(`Read page failed: ${err.message}`);
  }
});

$("create-from-page").addEventListener("click", async () => {
  if (!lastPageContext) return;
  try {
    const item = {
      source: "chrome-extension",
      title: lastPageContext.title,
      url: lastPageContext.url,
      selection: lastPageContext.selection,
      emails: lastPageContext.emails,
      phones: lastPageContext.phones,
      createdAt: new Date().toISOString(),
    };
    const created = await send({ type: "api:createItem", item });
    log(`Created item: ${JSON.stringify(created)}`);
    await refreshItems();
  } catch (err) {
    log(`Create failed: ${err.message}`);
  }
});

// --- Items list ---

async function refreshItems() {
  try {
    const data = await send({ type: "api:listItems" });
    const items = Array.isArray(data) ? data : data?.items || data?.data || [];
    const list = $("items-list");
    list.textContent = "";
    for (const item of items) {
      const li = document.createElement("li");
      li.textContent =
        typeof item === "string"
          ? item
          : item.title || item.name || JSON.stringify(item);
      list.appendChild(li);
    }
    $("items-empty").classList.toggle("hidden", items.length > 0);
    log(`Loaded ${items.length} item(s).`);
  } catch (err) {
    log(`Load items failed: ${err.message}`);
  }
}

$("refresh-items").addEventListener("click", refreshItems);

// --- Page tools ---

$("highlight-btn").addEventListener("click", async () => {
  const selector = $("selector-input").value.trim();
  if (!selector) return;
  try {
    const { matched } = await send({ type: "page:highlight", selector });
    log(`Highlighted ${matched} element(s) for "${selector}".`);
  } catch (err) {
    log(`Highlight failed: ${err.message}`);
  }
});

$("fill-btn").addEventListener("click", async () => {
  const selector = $("selector-input").value.trim();
  const value = $("fill-value").value;
  if (!selector) return;
  try {
    await send({ type: "page:fill", selector, value });
    log(`Filled "${selector}".`);
  } catch (err) {
    log(`Fill failed: ${err.message}`);
  }
});
