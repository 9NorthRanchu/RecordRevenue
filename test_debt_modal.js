const fs = require('fs');
const app = fs.readFileSync('frontend/app.js', 'utf8');
const lines = app.split('\n');
console.log(lines.slice(6070, 6080).join('\n'));
