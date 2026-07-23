const fs = require('fs');
const app = fs.readFileSync('frontend/app.js', 'utf8');
const idx = app.indexOf('window.viewDebtDetails = async function(debtId)');
console.log(app.substring(idx, idx + 4000));
