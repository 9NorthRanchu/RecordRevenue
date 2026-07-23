const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const html = fs.readFileSync('index.html', 'utf8');
const dom = new JSDOM(html);
const document = dom.window.document;

const captions = document.getElementById("settings-captions");
if (captions) {
    let parent = captions.parentElement;
    console.log("Parent of settings-captions:", parent.id || parent.className || parent.tagName);
}

const categories = document.getElementById("settings-categories");
if (categories) {
    let parent = categories.parentElement;
    console.log("Parent of settings-categories:", parent.id || parent.className || parent.tagName);
}

const contacts = document.getElementById("settings-contacts");
if (contacts) {
    let parent = contacts.parentElement;
    console.log("Parent of settings-contacts:", parent.id || parent.className || parent.tagName);
}

