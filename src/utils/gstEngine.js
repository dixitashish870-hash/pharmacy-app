/**
 * gstEngine.js
 * ─────────────────────────────────────────────────────────────
 * Centralized Indian Pharmacy GST Billing Engine
 *
 * RULES:
 *  1. MRP is GST-inclusive — never add GST on top.
 *  2. Discount is applied to (MRP × Qty) FIRST.
 *  3. GST is extracted from the discounted selling price.
 *  4. CGST = SGST = GST / 2   (intra-state retail).
 *  5. All values rounded to 2 decimal places.
 * ─────────────────────────────────────────────────────────────
 */

/** Round to 2 decimal places (banker-safe) */
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Compute a single line item's GST breakdown.
 *
 * @param {number} mrpPerUnit   - MRP per unit (GST-inclusive)
 * @param {number} qty          - Quantity
 * @param {number} gstPct       - GST rate (0 | 5 | 12 | 18 | 28)
 * @param {number} discPct      - Item-level discount %
 * @returns {{
 *   grossMrp: number,
 *   discountAmt: number,
 *   sellingPrice: number,
 *   taxableAmt: number,
 *   gstAmt: number,
 *   cgst: number,
 *   sgst: number,
 *   finalAmt: number,
 * }}
 */
export function computeLineItem(mrpPerUnit, qty, gstPct, discPct = 0) {
  const gst = Number(gstPct) || 0;
  const disc = Math.min(100, Math.max(0, Number(discPct) || 0));

  const grossMrp    = r2(mrpPerUnit * qty);
  const discountAmt = r2(grossMrp * (disc / 100));
  const sellingPrice = r2(grossMrp - discountAmt);

  // Extract taxable amount from GST-inclusive selling price
  const divisor     = 1 + gst / 100;
  const taxableAmt  = r2(sellingPrice / divisor);
  const gstAmt      = r2(sellingPrice - taxableAmt);
  const cgst        = r2(gstAmt / 2);
  const sgst        = r2(gstAmt / 2);

  return {
    grossMrp,
    discountAmt,
    sellingPrice,
    taxableAmt,
    gstAmt,
    cgst,
    sgst,
    finalAmt: sellingPrice,  // customer pays sellingPrice — tax is within
  };
}

/**
 * Compute full bill totals from a cart array + optional bill-level discount.
 *
 * Each cart item must have:
 *   { mrp_per_unit, quantity, gst, discount_pct, purchase_price }
 *
 * @param {Array}  items
 * @param {number} billDiscountAmt  - Flat bill-level discount in ₹
 * @returns {{
 *   grossMrp: number,
 *   itemDiscountTotal: number,
 *   preDiscountTotal: number,
 *   billDiscountAmt: number,
 *   totalDiscount: number,
 *   sellingTotal: number,
 *   taxableTotal: number,
 *   cgstTotal: number,
 *   sgstTotal: number,
 *   gstTotal: number,
 *   roundOff: number,
 *   netPayable: number,
 *   purchaseCostTotal: number,
 *   profit: number,
 *   gstSlabs: object,   // { '5': { taxable, cgst, sgst }, ... }
 * }}
 */
export function computeBillTotals(items, billDiscountAmt = 0) {
  const bd = Math.max(0, Number(billDiscountAmt) || 0);

  let grossMrp       = 0;
  let itemDiscTotal  = 0;
  let sellingTotal   = 0;
  let taxableTotal   = 0;
  let cgstTotal      = 0;
  let sgstTotal      = 0;
  let purchaseCost   = 0;
  const slabs = {};

  for (const item of items) {
    const mrp  = Number(item.mrp_per_unit || item.mrp || 0);
    const qty  = Number(item.quantity)    || 0;
    const gst  = Number(item.gst)         || 0;
    const disc = Number(item.discount_pct) || 0;
    const pp   = Number(item.purchase_price) || 0;

    const line = computeLineItem(mrp, qty, gst, disc);

    grossMrp      += line.grossMrp;
    itemDiscTotal += line.discountAmt;
    sellingTotal  += line.sellingPrice;
    taxableTotal  += line.taxableAmt;
    cgstTotal     += line.cgst;
    sgstTotal     += line.sgst;
    purchaseCost  += pp * qty;

    // Slab aggregation
    const slab = String(gst);
    if (!slabs[slab]) slabs[slab] = { taxable: 0, cgst: 0, sgst: 0 };
    slabs[slab].taxable += line.taxableAmt;
    slabs[slab].cgst    += line.cgst;
    slabs[slab].sgst    += line.sgst;
  }

  // Apply bill-level discount proportionally to selling price
  // (reduces taxable, cgst, sgst proportionally)
  const ratio = sellingTotal > 0 ? (1 - bd / sellingTotal) : 1;
  const adjSelling  = r2(sellingTotal  - bd);
  const adjTaxable  = r2(taxableTotal  * ratio);
  const adjCgst     = r2(cgstTotal     * ratio);
  const adjSgst     = r2(sgstTotal     * ratio);
  const adjGst      = r2(adjCgst + adjSgst);

  const rawPayable  = Math.max(0, adjSelling);
  const roundOff    = r2(Math.round(rawPayable) - rawPayable);
  const netPayable  = r2(rawPayable + roundOff);

  const profit = r2(rawPayable - purchaseCost);

  // Round slab values
  const gstSlabs = {};
  for (const [s, v] of Object.entries(slabs)) {
    gstSlabs[s] = {
      taxable: r2(v.taxable * ratio),
      cgst:    r2(v.cgst    * ratio),
      sgst:    r2(v.sgst    * ratio),
    };
  }

  return {
    grossMrp:         r2(grossMrp),
    itemDiscountTotal: r2(itemDiscTotal),
    preDiscountTotal:  r2(sellingTotal + bd), // before bill disc
    billDiscountAmt:   r2(bd),
    totalDiscount:     r2(itemDiscTotal + bd),
    sellingTotal:      r2(sellingTotal),
    taxableTotal:      adjTaxable,
    cgstTotal:         adjCgst,
    sgstTotal:         adjSgst,
    gstTotal:          adjGst,
    roundOff,
    netPayable,
    purchaseCostTotal: r2(purchaseCost),
    profit,
    gstSlabs,
  };
}

/**
 * Build a cart-ready item object from a product (as returned by API),
 * computing initial per-unit MRP respecting pack_size.
 */
export function buildCartItem(product) {
  const packSize    = parseInt(product.pack_size) || 1;
  const mrpPerUnit  = Math.round((parseFloat(product.mrp || product.price || 0) / packSize) * 100) / 100;
  const ppPerUnit   = Math.round((parseFloat(product.purchase_price || 0) / packSize) * 100) / 100;
  const gstPct      = parseFloat(product.gst) || 0;

  const line = computeLineItem(mrpPerUnit, 1, gstPct, 0);

  return {
    product_id:      product.id,
    name:            product.name,
    brand_name:      product.brand_name || '',
    salt_composition: product.salt_composition || '',
    hsn_code:        product.hsn_code || '',
    item_type:       product.item_type || 'PHARMA',
    category:        product.description || '',
    expiry:          product.expiry || '',
    batch:           product.batch || '',
    pack_size:       packSize,
    stock:           product.stock || 0,
    schedule_category: product.schedule_category || '',

    // Pricing
    mrp_per_unit:    mrpPerUnit,
    mrp:             mrpPerUnit,                  // alias used in table display
    original_strip_mrp: parseFloat(product.mrp || product.price || 0),
    purchase_price:  ppPerUnit,
    gst:             gstPct,
    discount_pct:    0,
    quantity:        1,

    // Pre-computed line (qty=1, disc=0)
    ...line,

    isNew: true,
  };
}

/**
 * Recompute a cart item's line figures after qty or discount change.
 */
export function recomputeItem(item) {
  const line = computeLineItem(item.mrp_per_unit, item.quantity, item.gst, item.discount_pct);
  return { ...item, ...line };
}

/** Friendly formatter for Indian locale */
export const fmtINR = (n) =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Short formatter (2 decimals, no locale grouping) */
export const fmt2 = (n) => parseFloat(n || 0).toFixed(2);
