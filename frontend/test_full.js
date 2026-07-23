const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM, VirtualConsole } = jsdom;

const virtualConsole = new VirtualConsole();
virtualConsole.on("error", (err) => { console.error("DOM ERROR:", err); });
virtualConsole.on("warn", (warn) => { console.warn("DOM WARN:", warn); });

let html = fs.readFileSync('index.html', 'utf8');
const appJs = fs.readFileSync('app.js', 'utf8');
html = html.replace('<script src="app.js"></script>', `<script>${appJs}</script>`);

const dom = new JSDOM(html, { 
    url: "http://localhost/", // avoid fetch origin errors
    runScripts: "dangerously", 
    resources: "usable",
    virtualConsole
});
setTimeout(() => {
    const window = dom.window;
    const document = window.document;
    
    // Mock fetch for loadSettings
    window.fetch = async (url) => {
        return {
            ok: true,
            json: async () => ({
                entities: [],
                contacts: [],
                captions: [],
                categories: [],
                accounts: [{account_id: '1', entity_id: 'e', name: 'n', bank_name: 'b', balance: 100}],
                projects: [],
                users: []
            })
        };
    };
    
    window.AppState = {
        userId: '1',
        userRole: 'admin',
        allowedEntities: [],
        settings: {}
    };

    // Call loadSettings
    if (window.loadSettings) {
        window.loadSettings().then(() => {
            console.log("loadSettings completed.");
            const newTabs = document.querySelectorAll(".settings-tab");
            console.log("Found tabs:", newTabs.length);
            newTabs[1].click();
            console.log("Second tab clicked. Active?", newTabs[1].classList.contains("active"));
        }).catch(err => {
            console.error("loadSettings threw:", err);
        });
    } else {
        console.error("loadSettings not found.");
    }
}, 1000);
