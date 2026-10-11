const fs = require('fs');
const html = fs.readFileSync('frontend/index.html', 'utf8');
const idx = html.indexOf('ACCOUNTS');
console.log(html.substring(idx - 100, idx + 1500));
