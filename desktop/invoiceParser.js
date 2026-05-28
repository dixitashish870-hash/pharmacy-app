/**
 * invoiceParser.js
 * Parses raw OCR text from a pharma GST invoice into structured data.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

function clean(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

/** Convert expiry strings like "10/27", "10/2027", "OCT-27", "10-27" → "2027-10" */
function parseExpiry(raw) {
  if (!raw) return '';
  raw = raw.trim().toUpperCase();

  // MM/YY or MM/YYYY
  let m = raw.match(/^(\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const month = m[1].padStart(2, '0');
    const yr = m[2].length === 2 ? '20' + m[2] : m[2];
    return `${yr}-${month}`;
  }

  // MON-YY or MON/YY
  const MONTHS = { JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12 };
  m = raw.match(/^([A-Z]{3})[/-](\d{2,4})$/);
  if (m && MONTHS[m[1]]) {
    const month = String(MONTHS[m[1]]).padStart(2, '0');
    const yr = m[2].length === 2 ? '20' + m[2] : m[2];
    return `${yr}-${month}`;
  }

  return '';
}

// ── Header extraction ─────────────────────────────────────────────────────────

function extractHeader(lines) {
  const text = lines.join(' ');

  // Invoice number patterns: INV.DT / INV NO / NPL-26-33933 etc.
  let invoiceNo = '';
  let invoiceDate = '';

  const invNoMatch = text.match(/INV(?:OICE)?[\s.]*N[O0]\.?\s*[:-]?\s*([A-Z0-9/-]+)/i)
    || text.match(/\bINV\s*N[O0]\s*[:-]?\s*([A-Z0-9/-]+)/i);
  if (invNoMatch) invoiceNo = invNoMatch[1].trim();

  // Look for bill/invoice number on its own — e.g. "NPL-26-33933"
  if (!invoiceNo) {
    const m = text.match(/\b([A-Z]{2,6}-\d{2}-\d{4,6})\b/);
    if (m) invoiceNo = m[1];
  }

  // Date: DD/MM/YYYY or DD-MM-YYYY or INV DT: 09/04/2026
  const dateMatch = text.match(/(?:INV(?:OICE)?[\s.]*DT|DATE|DATE\s*:)\s*[:-]?\s*(\d{2}[/-]\d{2}[/-]\d{4})/i)
    || text.match(/(\d{2}[/-]\d{2}[/-]\d{4})/);
  if (dateMatch) {
    const parts = dateMatch[1].split(/[/-]/);
    invoiceDate = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
  }

  // Supplier: look for company name near top (first 10 lines)
  let supplierName = '';
  for (const line of lines.slice(0, 15)) {
    if (/PHARMA|MEDICAL|DISTRIBUT|WHOLESALE|HEALTH|DRUG|LABS?|LIMITED|PVT|LTD/i.test(line) && line.length > 8) {
      supplierName = clean(line);
      break;
    }
  }

  // GST number
  const gstMatch = text.match(/GST(?:IN|NO|\.)?[\s:-]*([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{3})/i);
  const supplierGst = gstMatch ? gstMatch[1] : '';

  return { invoiceNo, invoiceDate, supplierName, supplierGst };
}

// ── Line-item extraction ──────────────────────────────────────────────────────

/**
 * Pharma invoice row pattern:
 * SR  QTY  [HSN]  DESCRIPTION  PACK  BATCH  EXP  MRP  RATE  GST%  AMOUNT  ...  NET
 *
 * We try two strategies:
 * 1. Detect a "header row" then parse subsequent rows positionally.
 * 2. Fallback regex per-line.
 */
function extractItems(lines) {
  const items = [];

  // Find the table header line
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/batch/i.test(lines[i]) && /exp/i.test(lines[i]) && /mrp/i.test(lines[i])) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx < 0) {
    // No table header found — try heuristic line-by-line
    return extractItemsFallback(lines);
  }

  // Walk rows after header line until we hit a totals line
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    // Stop at subtotal / order no / signature blocks
    if (/order no|gross amt|subtotal|total|rupees in words|shortage|certified|swayBill/i.test(line)) break;

    // Must start with a number (SR column) OR match a common medicine pattern
    const srMatch = line.match(/^\s*(\d{1,3})\s+(\d+)\s+(\d{7,8})\s+(.+)/);
    if (srMatch) {
      // Format: SR QTY HSN DESCRIPTION ...
      const rest = srMatch[4];
      const item = parseItemRow(line, rest);
      if (item) items.push(item);
      continue;
    }

    // Format without HSN: SR QTY DESCRIPTION ...
    const srMatch2 = line.match(/^\s*(\d{1,3})\s+\S+\s+(.+)/);
    if (srMatch2) {
      const item = parseItemRow(line, line);
      if (item) items.push(item);
    }
  }

  return items.length > 0 ? items : extractItemsFallback(lines);
}

function parseItemRow(fullLine, descPart) {
  // Extract all numbers from the line
  const nums = [...fullLine.matchAll(/[\d]+\.?\d*/g)].map(m => parseFloat(m[0]));

  // The description is everything between the SR#/QTY and the PACK column
  // Extract drug name: uppercase words, may include numbers (DOLO 650, CALPOL 500, etc.)
  const nameMatch = descPart.match(/([A-Z][A-Z0-9\s./-]+(?:TAB|CAP|SYP|INJ|OIN|CRE|GEL|DRO|PWD|SAC|ML|MG|GM|MCG)[A-Z0-9\s./-]*)/i);
  const name = nameMatch ? clean(nameMatch[1]) : '';
  if (!name || name.length < 3) return null;

  // Batch: look for alphanumeric batch patterns like "N2S2410", "SRC235A"
  const batchMatch = fullLine.match(/\b([A-Z]{1,3}[0-9]{3,8}[A-Z]?|[A-Z0-9]{5,10})\b/g);
  const batch = batchMatch ? batchMatch.find(b => /\d/.test(b) && /[A-Z]/i.test(b) && b.length >= 4) || '' : '';

  // Expiry: MM/YY patterns
  const expMatch = fullLine.match(/\b(1[0-2]|0?\d)[/-](\d{2})\b/g);
  const expiry = expMatch ? parseExpiry(expMatch[expMatch.length - 1]) : '';

  // Pick numbers: qty is usually first small integer, MRP and rate are larger
  const qty    = nums.find(n => n > 0 && n <= 200 && Number.isInteger(n)) || 1;
  const mrp    = nums.find(n => n > 1 && n < 10000) || 0;
  const rate   = nums.find(n => n > 0 && n < mrp && n !== qty) || 0;
  const gstRaw = nums.find(n => [0,5,12,18,28].includes(n)) || 12;

  return { name, batch, expiry, quantity: qty, mrp, purchase_price: rate || mrp, gst: gstRaw };
}

function extractItemsFallback(lines) {
  const items = [];
  for (const line of lines) {
    if (!line.trim() || line.length < 20) continue;
    if (/total|subtotal|amount|gst|igst|cgst|sgst|discount|rupees|order|shortage|certified|swayBill|page/i.test(line.slice(0, 30))) continue;

    // Look for lines that have an expiry date (MM/YY) — strong signal it's an item row
    const expMatch = line.match(/\b(1[0-2]|0?\d)[/-](\d{2})\b/g);
    if (!expMatch) continue;

    const nameMatch = line.match(/([A-Z][A-Z0-9\s./-]*(?:TAB|CAP|SYP|INJ|OIN|CRE|GEL|DRO|PWD|SAC)\s*[\d\s.]*(?:ML|MG|GM|MCG)?)/i);
    if (!nameMatch) continue;

    const name = clean(nameMatch[1]);
    if (name.length < 4) continue;

    const nums = [...line.matchAll(/[\d]+\.?\d*/g)].map(m => parseFloat(m[0]));
    const qty  = nums.find(n => n > 0 && n <= 200 && Number.isInteger(n)) || 1;
    const expiry = parseExpiry(expMatch[expMatch.length - 1]);
    const batchMatch = line.match(/\b([A-Z]{1,3}\d{3,8}[A-Z]?)\b/i);
    const batch = batchMatch ? batchMatch[1].toUpperCase() : '';
    const prices = nums.filter(n => n > 1 && n < 5000).sort((a,b) => b-a);
    const mrp  = prices[0] || 0;
    const rate = prices[1] || mrp;
    const gstCand = nums.find(n => [0,5,12,18,28].includes(n)) || 12;

    items.push({ name, batch, expiry, quantity: qty, mrp, purchase_price: rate, gst: gstCand });
  }
  return items;
}

// ── Main export ───────────────────────────────────────────────────────────────

function parsePharmaInvoice(rawText) {
  const lines = rawText
    .split('\n')
    .map(l => l.replace(/\r/g, '').trimEnd())
    .filter(l => l.trim().length > 0);

  const header = extractHeader(lines);
  const items  = extractItems(lines);

  return { ...header, items };
}

module.exports = { parsePharmaInvoice };
