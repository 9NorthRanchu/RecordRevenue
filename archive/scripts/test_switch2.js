const fs = require('fs');
const app = fs.readFileSync('frontend/app.js', 'utf8');
const idx = app.indexOf('if (viewName === \'dashboard\')');
console.log(app.substring(idx - 100, idx + 500));
