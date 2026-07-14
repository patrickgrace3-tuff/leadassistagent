// Side panel UI. All privileged work (API calls, tab access) happens in the
// background service worker; this file only sends messages and renders results.

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
