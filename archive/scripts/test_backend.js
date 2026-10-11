const fs = require('fs');
const code = fs.readFileSync('backend/src/index.js', 'utf8');
const idx = code.indexOf('/api/settings/save');
console.log(code.substring(idx, idx + 2000));
