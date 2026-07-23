import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

# Fix the IDs used in the injected JS
app = app.replace("document.getElementById('debt-contact-id')", "document.getElementById('debt-contact')")
app = app.replace("document.getElementById('debt-principal-cat')", "document.getElementById('debt-principal-category')")
app = app.replace("document.getElementById('debt-interest-cat')", "document.getElementById('debt-interest-category')")

with open(app_js_path, 'w') as f:
    f.write(app)

print("IDs fixed in app.js")
