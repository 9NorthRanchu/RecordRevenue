const fs = require('fs');
const lines = fs.readFileSync('frontend/app.js', 'utf8').split('\n');
for (let i = 6390; i < 6400; i++) {
    console.log(`${i+1}: ${lines[i]}`);
}
