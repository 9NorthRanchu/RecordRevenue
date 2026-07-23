const fs = require('fs');
const lines = fs.readFileSync('frontend/app.js', 'utf8').split('\n');
for (let i = 6397; i < 6410; i++) {
    console.log(`${i+1}: ${lines[i]}`);
}
