const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM, VirtualConsole } = jsdom;

const virtualConsole = new VirtualConsole();
virtualConsole.on("error", (err) => { console.error("DOM ERROR:", err); });

let html = fs.readFileSync('index.html', 'utf8');
const appJs = fs.readFileSync('app.js', 'utf8');
// Remove the external app.js link entirely
html = html.replace(/<script src="app\.js[^>]*><\/script>/, '');
// Inject it directly
html += `\n<script>\n${appJs}\n</script>`;

const dom = new JSDOM(html, { 
    url: "http://localhost/", 
    runScripts: "dangerously", 
    virtualConsole
});

setTimeout(() => {
    const window = dom.window;
    
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

    if (window.loadSettings) {
        window.loadSettings().then(() => {
            console.log("loadSettings completed successfully.");
        }).catch(err => {
            console.error("loadSettings threw an error:", err);
        });
    } else {
        console.log("loadSettings function not found in window.");
    }
}, 2000);
