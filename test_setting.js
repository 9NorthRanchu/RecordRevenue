const fs = require('fs');
const app = fs.readFileSync('frontend/app.js', 'utf8');
const idx = app.indexOf('window.openSettingModal = function(type, id = null)');
console.log(app.substring(idx, idx + 4000));
