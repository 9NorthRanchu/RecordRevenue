const fs = require('fs');
const code = fs.readFileSync('backend/src/index.js', 'utf8');
const idx = code.indexOf('CREATE TABLE IF NOT EXISTS Debts');
console.log(code.substring(idx, idx + 1000));
