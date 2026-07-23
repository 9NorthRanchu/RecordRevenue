const fs = require('fs');
let content = fs.readFileSync('src/index.js', 'utf8');

// Replace exact matches
content = content.replace(/AccountTypes/g, 'Captions');
content = content.replace(/account_type_id/g, 'caption_id');
content = content.replace(/account_type_name/g, 'caption_name');
content = content.replace(/account_type_behavior/g, 'caption_behavior');
content = content.replace(/account_types/g, 'captions');
content = content.replace(/'account_type'/g, "'caption'");

fs.writeFileSync('src/index.js', content);
console.log('Done replacing in index.js');
