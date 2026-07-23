const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const html = fs.readFileSync('index.html', 'utf8');
const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable" });

// Mock app.js functions if needed, but app.js will be loaded by JSDOM if resources="usable"
// Let's just manually run the tab logic in the dom context
setTimeout(() => {
    const window = dom.window;
    const document = window.document;
    
    // Check if tabs exist
    const tabs = document.querySelectorAll(".settings-tab");
    console.log("Tabs found:", tabs.length);
    
    // Simulate what setupSettingsEvents does
    tabs.forEach(tab => tab.replaceWith(tab.cloneNode(true)));
    
    const newTabs = document.querySelectorAll(".settings-tab");
    newTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            newTabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            const targetTab = tab.getAttribute("data-settings-tab");
            document.querySelectorAll(".settings-section-content").forEach(sec => {
                sec.classList.add("hidden");
                sec.classList.remove("active");
            });
            const activeSec = document.getElementById(`settings-${targetTab}`);
            if (activeSec) {
                activeSec.classList.remove("hidden");
                activeSec.classList.add("active");
            }
            console.log("Clicked", targetTab, "activeSec hidden?", activeSec.classList.contains("hidden"));
        });
    });
    
    // Trigger click on second tab
    newTabs[1].click();
    console.log("Second tab active class:", newTabs[1].classList.contains("active"));
}, 1000);
