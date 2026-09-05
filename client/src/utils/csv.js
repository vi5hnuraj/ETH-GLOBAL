/** Client-side CSV helpers for the Developer Platform. */

const escapeCell = (value) => {
  const v = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
};

/** Convert an array of objects (or array of arrays) into CSV text. */
export const toCsv = (rows, columns) => {
  if (!rows || rows.length === 0) return '';
  const header = columns ? columns.map((c) => c.label || c.key) : Object.keys(rows[0]);
  const body = rows.map((row) => {
    if (Array.isArray(row)) return row.map(escapeCell).join(',');
    return header.map((h) => {
      const col = columns ? columns.find((c) => (c.label || c.key) === h) : null;
      const key = col ? col.key : h;
      const v = row[key];
      return escapeCell(typeof v === 'object' ? JSON.stringify(v) : v);
    }).join(',');
  });
  return [header.map(escapeCell).join(','), ...body].join('\n');
};

/** Trigger a browser download of text content. */
export const downloadFile = (filename, content, mime = 'text/csv') => {
  const blob = new Blob([content], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/** Convenience: serialize rows and download in one step. */
export const downloadCsv = (filename, rows, columns) =>
  downloadFile(filename, toCsv(rows, columns));
