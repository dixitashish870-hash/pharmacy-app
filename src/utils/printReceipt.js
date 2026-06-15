import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import ReceiptPrinter from '../components/ReceiptPrinter';

/**
 * printReceipt(sale, options)
 *
 * Renders the receipt as a self-contained HTML document inside a hidden
 * <iframe> and calls iframe.contentWindow.print() only after the iframe's
 * load event fires — so the DOM is guaranteed to be ready.
 *
 * This completely avoids:
 *  - The @media print CSS race condition
 *  - Printing the whole page instead of just the receipt
 *  - The 100ms setTimeout hack
 *
 * @param {object} sale      — sale object passed to ReceiptPrinter
 * @param {object} [opts]
 * @param {string} [opts.printMode='thermal'] — 'thermal' | 'a5'
 * @param {object} [opts.storeInfo={}]        — store settings object
 */
export function printReceipt(sale, { printMode, storeInfo = {} } = {}) {
  if (!sale) return;

  const mode = printMode || storeInfo?.bill_paper_size || 'thermal';

  // 1. Render the receipt component to static HTML (no browser needed)
  const receiptHtml = renderToStaticMarkup(
    React.createElement(ReceiptPrinter, { sale, printMode: mode, storeInfo })
  );

  // 2. Build a minimal self-contained HTML document.
  //    The receipt uses inline styles only, so no external CSS is needed.
  //    We force display:block on .print-only so it shows in the iframe.
  const doc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #fff; }
    .print-only { display: block !important; }
    @media print {
      @page { margin: 0; }
      body { margin: 0; }
    }
  </style>
</head>
<body>${receiptHtml}</body>
</html>`;

  // 3. Create a hidden iframe, append to body
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;border:none;pointer-events:none;';
  document.body.appendChild(iframe);

  // 4. Write the document into the iframe, then print after load
  iframe.addEventListener('load', () => {
    try {
      iframe.contentWindow.focus(); // required for some browsers
      iframe.contentWindow.print();
    } finally {
      // Clean up the iframe after the print dialog closes (or is cancelled)
      // Small delay because print() is synchronous on some browsers but async on others
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1000);
    }
  });

  // Write after attaching the load listener
  iframe.contentDocument.open();
  iframe.contentDocument.write(doc);
  iframe.contentDocument.close();
}
