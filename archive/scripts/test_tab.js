const fs = require('fs');
const app = fs.readFileSync('frontend/app.js', 'utf8');
const idx = app.indexOf('let currentDebtTab');
console.log(app.substring(idx, idx + 500));
