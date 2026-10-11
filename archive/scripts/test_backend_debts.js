const fs = require('fs');
const code = fs.readFileSync('backend/src/index.js', 'utf8');
const idx = code.indexOf('/api/debts');
console.log(code.substring(idx, idx + 1000));
