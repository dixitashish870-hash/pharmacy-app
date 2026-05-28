const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'pages', 'Sales.jsx');
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

// Find the closing brace of the new ReturnModal (line 221 = index 220)
// And the start of Date Helpers comment
const dateHelpersIdx = lines.findIndex(l => l.trim() === '// Date Helpers');
const modalEnd = 221; // 1-indexed, the closing } of new ReturnModal is line 221

console.log('Date helpers line:', dateHelpersIdx + 1);
console.log('Lines between modal end and date helpers:', dateHelpersIdx - modalEnd);

// Remove lines 223 to dateHelpersIdx (the orphaned old code)
// 1-indexed: remove from line 223 (index 222) to dateHelpersIdx (exclusive)
const before = lines.slice(0, 222); // lines 1–222 (indices 0–221)
const after  = lines.slice(dateHelpersIdx); // from Date Helpers onward

const newLines = [...before, '', ...after];
fs.writeFileSync(file, newLines.join('\n'), 'utf8');
console.log('Done! Removed', dateHelpersIdx - 222, 'orphaned lines.');
