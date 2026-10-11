const fs = require('fs');
const lines = fs.readFileSync('frontend/app.js', 'utf8').split('\n');
for (let i = 6420; i < 6445; i++) {
    console.log(`${i+1}: ${lines[i]}`);
}
