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
