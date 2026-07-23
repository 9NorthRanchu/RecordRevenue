const fs = require('fs');
const app = fs.readFileSync('frontend/app.js', 'utf8');
const idx = app.indexOf('async function saveDebtProfile');
console.log(app.substring(idx, idx + 1000));
