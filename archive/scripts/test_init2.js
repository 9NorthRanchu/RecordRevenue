const fs = require('fs');
const app = fs.readFileSync('frontend/app.js', 'utf8');
const idx = app.indexOf('async function initApp()');
console.log(app.substring(idx + 1000, idx + 2000));
