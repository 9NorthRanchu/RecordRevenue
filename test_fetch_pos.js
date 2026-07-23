const fs = require('fs');
const app = fs.readFileSync('frontend/app.js', 'utf8');
const idx = app.indexOf('window.fetchTransactions');
console.log(app.substring(idx - 200, idx + 500));
