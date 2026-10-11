const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const html = fs.readFileSync('frontend/index.html', 'utf8');
const scriptContent = fs.readFileSync('frontend/app.js', 'utf8');

const dom = new JSDOM(html, { runScripts: "outside-only" });
const window = dom.window;
const document = window.document;

// Mock fetch and other globals
window.fetch = async () => ({ json: async () => ([]) });
window.alert = () => {};
window.setTimeout = (cb, ms) => { try { cb(); } catch(e) {} };
window.encodeURIComponent = encodeURIComponent;

try {
    window.eval(scriptContent);
    console.log("Script evaluated successfully");
    
    // Simulate what happens when showDebtModal is called
    window.showDebtModal();
    console.log("showDebtModal ran successfully");
    
} catch (e) {
    console.error("Error:", e);
}
