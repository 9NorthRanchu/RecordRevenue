const fs = require('fs');
const code = fs.readFileSync('backend/src/index.js', 'utf8');
const idx = code.indexOf('if (dup) {');
console.log(code.substring(idx - 100, idx + 1500));
