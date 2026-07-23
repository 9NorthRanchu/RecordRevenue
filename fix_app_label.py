import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

# Add logic to change label text
# Find the line: document.getElementById("setting-name").value = '';
# And insert label changing logic before it

label_logic = """    const nameLabel = document.getElementById("setting-name-label");
    if (nameLabel) {
        if (type === 'entity') nameLabel.innerText = "ชื่อ Owner (Owner Name)";
        else if (type === 'contact') nameLabel.innerText = "ชื่อ คู่ค้า (Contact Name)";
        else if (type === 'caption') nameLabel.innerText = "ชื่อ ประเภทหลัก (Caption Name)";
        else if (type === 'category') nameLabel.innerText = "ชื่อ ประเภทย่อย (Category Name)";
        else if (type === 'account') nameLabel.innerText = "ชื่อ บัญชี (Account Name)";
        else if (type === 'project') nameLabel.innerText = "ชื่อ โครงการ (Project Name)";
        else nameLabel.innerText = "ชื่อรายการ (Name)";
    }

    document.getElementById("setting-name").value = '';"""

app = app.replace("document.getElementById(\"setting-name\").value = '';", label_logic)

with open(app_js_path, 'w') as f:
    f.write(app)

print("App JS fixed label")
