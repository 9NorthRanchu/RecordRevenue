app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

app = app.replace("document.getElementById('debt-modal').classList.remove('hidden');\\n    setTimeout(() => { document.getElementById('icon-grid')?.focus(); }, 100);",
                  "document.getElementById('debt-modal').classList.remove('hidden');\n    setTimeout(() => { document.getElementById('icon-grid')?.focus(); }, 100);")

with open(app_js_path, 'w') as f:
    f.write(app)
print("Fixed literal slash n!")
