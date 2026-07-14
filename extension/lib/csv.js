// Minimal delimited-text parser for bulk import. Handles both CSV (from
// uploaded .csv files) and TSV (what you get when you copy cells straight out
// of Excel or Google Sheets and paste them). Quoted fields, escaped quotes
// ("") and newlines inside quotes are all supported.

export function parseTable(text) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return { headers: [], rows: [] };

  // Excel/Sheets paste uses tabs; .csv uses commas. Sniff the header line.
  const firstLine = normalized.split("\n", 1)[0];
  const delimiter = firstLine.includes("\t") ? "\t" : ",";

  const records = parseDelimited(normalized, delimiter);
  if (records.length === 0) return { headers: [], rows: [] };

  const headers = records[0].map((h) => h.trim()).filter((h) => h !== "");
  const rows = records
    .slice(1)
    .filter((cells) => cells.some((c) => c.trim() !== "")) // drop blank lines
    .map((cells) => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = (cells[i] ?? "").trim();
      });
      return obj;
    });

  return { headers, rows };
}

// Turn a cell string into a typed JSON value. Empty cells become undefined so
// the caller can omit the field entirely (and let the API apply its default).
// Leading-zero strings (zips, phone numbers) are left as strings on purpose.
export function coerceValue(raw) {
  const s = String(raw).trim();
  if (s === "") return undefined;
  const lower = s.toLowerCase();
  if (lower === "true") return true;
  if (lower === "false") return false;
  if (lower === "null") return null;
  if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(s)) return Number(s);
  return s;
}

// Expand a flat header→string row into a typed, possibly-nested JSON body:
//   "business_hours.from"  -> { business_hours: { from: 8 } }
//   "sources[]" = "A|B|C"  -> { sources: ["A", "B", "C"] }
// Values are coerced with coerceValue; empty cells are skipped.
export function buildBody(row) {
  const body = {};
  for (const [rawKey, rawVal] of Object.entries(row)) {
    let key = rawKey.trim();
    if (key === "") continue;

    const isArray = key.endsWith("[]");
    if (isArray) key = key.slice(0, -2);

    let value;
    if (isArray) {
      value = String(rawVal)
        .split("|")
        .map((p) => coerceValue(p))
        .filter((p) => p !== undefined);
      if (value.length === 0) continue;
    } else {
      value = coerceValue(rawVal);
      if (value === undefined) continue;
    }

    const path = key.split(".");
    let node = body;
    for (let i = 0; i < path.length - 1; i++) {
      const seg = path[i];
      if (typeof node[seg] !== "object" || node[seg] === null) node[seg] = {};
      node = node[seg];
    }
    node[path[path.length - 1]] = value;
  }
  return body;
}

function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++; // skip the escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  row.push(field);
  rows.push(row);
  return rows;
}
