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

## Set your identity token (do this first)

Every teammate needs their own token, and it must **not** be committed. Keep it
in a local, gitignored file:

```bash
cd extension
cp config.example.js config.local.js   # then edit config.local.js
```

Put your token in `config.local.js`:

```js
export default {
  identityToken: "your-personal-access-token",
};
```

The token is a Passport token from the ConversionIA Identity Server: create a
service account at
[admin.conversionext.com](https://admin.conversionext.com/admin/resources/service-accounts),
assign the super-admin role, then use the **Create Personal Access Token**
action. It is sent as the `X-Conversion-Identity-Token` header (this API does
**not** use `Authorization: Bearer`). Reload the extension after editing the file.

> `config.local.js` is in `.gitignore`, so your token stays on your machine.
> The Settings page also has a token field if you'd rather not use the file — a
> value entered there overrides the file.

## Configure the API

1. Click **⚙ Settings** in the side panel (or right-click the icon → Options).
2. Confirm:
   - **API base URL** — `https://leadassist.ai/api/v1` (endpoint paths are
     appended to this).
   - **Users / Client status endpoint paths** — defaults `/users` and
     `/clients/{client}/statuses`; `{client}` is filled from the Client ID you
     enter in the Client Status tab.
3. Click **Save & test connection**.

Non-secret settings are stored via `chrome.storage.sync` (they follow your
Chrome profile); the token lives in `config.local.js`.

## What it can do today

- **Bulk add users** — upload a `.csv` or paste rows (copy straight from Excel /
  Sheets), preview them, then send one `POST /users` per row with a live
  progress bar and per-row success/failure report.
- **Bulk client statuses** — create statuses (New, Reapply, Qualified, …) for a
  client. Enter the Client ID and one row per status; each is sent to
  `POST /clients/{client}/statuses`.
- **Download failed rows** — after any bulk import, export just the rows that
  failed (with an `_error` column) as a CSV, so you can fix and re-run them.
- **Read current page** — pulls title, URL, current text selection, headings,
  and any emails/phone numbers found on the page.
- **Create item from this page** — POSTs the captured page context to the API.
- **Items list** — GETs and displays items from the API.
- **Highlight** — outlines elements on the active page matching a CSS selector.
- **Fill on page** — writes a value into an input/textarea on the active page
  (dispatches `input`/`change` events so React-style forms notice).

### Bulk import format

The **first row is column headers** and each header becomes a field on the JSON
body sent (one `POST` per data row). Cell values are typed automatically:
`true`/`false` → booleans, plain integers/decimals → numbers, empty cells are
omitted (so the API applies its own default). Leading-zero strings (zips, phone
numbers) stay strings.

Two header conventions cover the nested Lead Assist payloads:

- **Nested fields** with dots: `business_hours.from` → `{ "business_hours": { "from": 8 } }`
- **Arrays** with `[]` and `|`-separated values: a `sources[]` cell of
  `Indeed|Facebook|Chat` → `{ "sources": ["Indeed", "Facebook", "Chat"] }`

**Bulk Users** (`POST /users`) — a minimal file:

```csv
name,email,phone,password,role
Ann Lee,ann@example.com,+16155550123,SecureP@ss1,admin
```

A richer one using the conventions:

```csv
name,email,password,business_hours.from,business_hours.to,sources[]
Ann Lee,ann@example.com,SecureP@ss1,8,17,Indeed|Facebook
```

**Bulk client statuses** (`POST /clients/{client}/statuses`) — enter the Client
ID in the tab, then one row per status:

```csv
name,priority,active,not_qualified,allow_scheduled_calls
New,1,true,false,false
Reapply,2,true,false,true
```

Both endpoints de-duplicate: an existing user email / status name is returned
rather than re-created, so re-running an import is safe.

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
