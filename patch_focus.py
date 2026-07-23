app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

target = "document.getElementById('debt-modal').classList.remove('hidden');"
replacement = "document.getElementById('debt-modal').classList.remove('hidden');\\n    setTimeout(() => { document.getElementById('icon-grid')?.focus(); }, 100);"

if target in app:
    app = app.replace(target, replacement)
    with open(app_js_path, 'w') as f:
        f.write(app)
    print("Patched modal focus!")
else:
    print("Could not find target line!")
