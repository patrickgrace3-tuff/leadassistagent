# Lead Assist Agent

A Chrome extension (Manifest V3) that works alongside the active browser tab.
It opens as a **side panel**, can **read context from the current page**
(title, URL, selected text, detected emails/phone numbers), and talks to the
Lead Assist **system API** to list and create items.

No build step — plain HTML/CSS/JS — so the team can clone and load it
directly in developer mode.

## Install (developer mode)

1. Clone this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Toggle **Developer mode** on (top right).
4. Click **Load unpacked** and select the `extension/` folder in this repo.
5. Pin the "Lead Assist Agent (Dev)" icon from the puzzle-piece menu.
6. Click the icon (or press `Ctrl+Shift+L` / `Cmd+Shift+L`) to open the side panel.

After pulling new changes, click the **↻ reload** button on the extension's
card in `chrome://extensions`.

## Configure the API

1. Click **⚙ Settings** in the side panel (or right-click the icon → Options).
2. Set:
   - **API base URL** — e.g. `https://api.yourcompany.com/v1` or `http://localhost:3000/api` during development.
   - **API key** — sent as an `Authorization: Bearer <key>` header (leave blank if your API doesn't need one).
   - **Items endpoint path** — the resource used by the side panel's list/create buttons (default `/items`).
3. Click **Save & test connection**.

Settings are stored via `chrome.storage.sync`, so they follow each teammate's
Chrome profile.

## What it can do today

- **Bulk add users** — upload a `.csv` or paste rows (copy straight from Excel /
  Sheets), preview them, then send one `POST` per row to your users endpoint
  with a live progress bar and per-row success/failure report.
- **Bulk client statuses** — apply a status (New, Reapply, …) to many leads at
  once. Pick the status from a configurable list; each row identifies a lead.
- **Read current page** — pulls title, URL, current text selection, headings,
  and any emails/phone numbers found on the page.
- **Create item from this page** — POSTs the captured page context to the API.
- **Items list** — GETs and displays items from the API.
- **Highlight** — outlines elements on the active page matching a CSS selector.
- **Fill on page** — writes a value into an input/textarea on the active page
  (dispatches `input`/`change` events so React-style forms notice).

### Bulk import format

The **first row is column headers** and each header becomes a field on the JSON
object sent to your API. So a Bulk Users file like:

```csv
email,name,role
ann@example.com,Ann Lee,agent
bo@example.com,Bo Ray,manager
```

sends `POST {usersPath}` twice, with bodies
`{ "email": "ann@example.com", "name": "Ann Lee", "role": "agent" }` etc. Make
your columns match the fields your API expects.

For **client statuses**, each row identifies a lead (e.g. an `email` or
`leadId` column) and the picked status is added under the configured status
field (default `status`). A per-row `status` column, if present, overrides the
picker. Configure the endpoints, the status field name, and the list of status
options on the **Settings** page.

> Excel `.xlsx` files aren't parsed directly — either **Save As → CSV**, or just
> select the cells in Excel and **paste** them into the box (they arrive as
> tab-separated rows, which the extension handles).

## Architecture

```
extension/
├── manifest.json               Manifest V3 definition
├── background/
│   └── service-worker.js       Message router; all API calls happen here
├── sidepanel/
│   ├── sidepanel.html/.css/.js Side panel UI (chrome.sidePanel)
├── content/
│   ├── content-script.js       Runs in the page: read context, highlight, fill
│   └── content-styles.css      Highlight styling
├── options/
│   └── options.html/.css/.js   API base URL / key / endpoint settings
└── lib/
    └── api-client.js           fetch wrapper + settings storage
```

Message flow:

- The **side panel** never touches the page or network directly; it sends
  `chrome.runtime.sendMessage({ type: ... })` to the **service worker**.
- `api:*` messages are fulfilled by `lib/api-client.js` from the worker, so
  requests are governed by the extension's `host_permissions` rather than the
  page's CORS policy.
- `page:*` messages are forwarded to the **content script** in the active tab
  (auto-injected on demand if the tab predates the extension load).

There's also a generic passthrough for new endpoints without touching the
worker: `{ type: "api:request", method: "POST", path: "/leads", body: {...} }`.

## Adapting to your API

- Point **Items endpoint path** at whatever resource you want the panel to
  list/create (it expects a JSON array, or `{ items: [...] }` / `{ data: [...] }`).
- Add richer operations as new handlers in
  `extension/background/service-worker.js` and wire buttons in
  `extension/sidepanel/sidepanel.js`.
- Once the API's domain is stable, narrow `host_permissions` and the content
  script `matches` in `manifest.json` from `<all_urls>` to the specific
  domains you need — tighter permissions, fewer scary install warnings.

## Notes

- `minimum_chrome_version` is 116 (needed for `sidePanel.setPanelBehavior`).
- Chrome blocks extensions on its own pages (`chrome://…`, the Web Store);
  "Read current page" will report an error there — that's expected.
