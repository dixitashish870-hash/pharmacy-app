const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'pages', 'Sales.jsx');
const lines = fs.readFileSync(file, 'utf8').split('\n');

// Find the </tbody> that comes right after the Bill Total row
const billTotalIdx = lines.findIndex(l => l.includes('Bill Total (Inc. GST)'));
if (billTotalIdx === -1) { console.error('Could not find Bill Total line'); process.exit(1); }

// The </tr> is 2 lines after, then </tbody> is 1 more
const tbodyIdx = billTotalIdx + 3;
console.log('Bill Total line:', billTotalIdx + 1, '| </tbody> candidate line:', tbodyIdx + 1, ':', lines[tbodyIdx]);

const refundRows = [
'                                                        {(sale.refunded_amount || 0) > 0 && (',
'                                                           <tr style={{ borderTop: "1px solid var(--border)", background: "rgba(245,158,11,0.05)" }}>',
'                                                              <td colSpan={3} className="px-4 py-2 text-right text-[10px] font-black uppercase tracking-widest text-amber-600">Amount Refunded</td>',
'                                                              <td className="px-4 py-2 text-right text-sm font-black text-amber-500">- \u20b9{(sale.refunded_amount || 0).toFixed(2)}</td>',
'                                                           </tr>',
'                                                        )}',
'                                                        {(sale.refunded_amount || 0) > 0 && (',
'                                                           <tr style={{ borderTop: "2px solid var(--border)", background: "var(--surface-2)" }}>',
'                                                              <td colSpan={3} className="px-4 py-3 text-right text-xs uppercase font-bold" style={{ color: "var(--text-muted)" }}>Net Effective Total</td>',
'                                                              <td className="px-4 py-3 text-right text-lg font-black text-emerald-600">\u20b9{((sale.total_amount || 0) - (sale.refunded_amount || 0)).toFixed(2)}</td>',
'                                                           </tr>',
'                                                        )}',
];

lines.splice(tbodyIdx, 0, ...refundRows);
fs.writeFileSync(file, lines.join('\n'), 'utf8');
console.log('Done! Inserted', refundRows.length, 'lines at line', tbodyIdx + 1);
