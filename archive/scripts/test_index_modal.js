const fs = require('fs');
const html = fs.readFileSync('frontend/index.html', 'utf8');

const idx = html.indexOf('<!-- Debt Profile Modal -->');
console.log(html.substring(idx, idx + 4000));
