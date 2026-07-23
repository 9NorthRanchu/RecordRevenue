const fs = require('fs');
const idx = fs.readFileSync('backend/src/index.js', 'utf8');

const postIdx = idx.indexOf('if (pathname === "/api/debts" && request.method === "POST")');
console.log("POST:", idx.substring(postIdx, postIdx + 1500));

const putIdx = idx.indexOf('if (pathname.startsWith("/api/debts/") && request.method === "PUT")');
console.log("PUT:", idx.substring(putIdx, putIdx + 1500));
