import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

# Replace the <td> elements for typeLbl in captions and categories
app = app.replace("<td>${typeLbl}</td>", "")

with open(app_js_path, 'w') as f:
    f.write(app)

print("App JS fixed typeLbl td")
