import re

html_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/index.html"
with open(html_path, 'r') as f:
    html = f.read()

# Add Icon Selector to the Add/Edit Debt Modal
icon_selector_html = """
                    <div class="form-group" style="margin-top: 15px;">
                        <label>เลือกไอคอนหน้าบัตร (Icon Theme)</label>
                        <div id="debt-icon-selector" style="display: flex; gap: 10px; margin-top: 5px;">
                            <div class="icon-option selected" data-icon="credit_card" style="width: 40px; height: 40px; border-radius: 10px; background: #a2d2ff; display: flex; align-items: center; justify-content: center; cursor: pointer; border: 2px solid #3d5a80;"><i class="fa-solid fa-credit-card" style="color: #2c3e50;"></i></div>
                            <div class="icon-option" data-icon="car" style="width: 40px; height: 40px; border-radius: 10px; background: #ffb5a7; display: flex; align-items: center; justify-content: center; cursor: pointer; border: 2px solid transparent;"><i class="fa-solid fa-car" style="color: #2c3e50;"></i></div>
                            <div class="icon-option" data-icon="house" style="width: 40px; height: 40px; border-radius: 10px; background: #bde0fe; display: flex; align-items: center; justify-content: center; cursor: pointer; border: 2px solid transparent;"><i class="fa-solid fa-house" style="color: #2c3e50;"></i></div>
                            <div class="icon-option" data-icon="personal" style="width: 40px; height: 40px; border-radius: 10px; background: #ffd6a5; display: flex; align-items: center; justify-content: center; cursor: pointer; border: 2px solid transparent;"><i class="fa-solid fa-sack-dollar" style="color: #2c3e50;"></i></div>
                            <div class="icon-option" data-icon="student" style="width: 40px; height: 40px; border-radius: 10px; background: #caffbf; display: flex; align-items: center; justify-content: center; cursor: pointer; border: 2px solid transparent;"><i class="fa-solid fa-graduation-cap" style="color: #2c3e50;"></i></div>
                        </div>
                    </div>
"""

# Find where the Add/Edit Debt modal is and inject it after the Start Balance
# Look for <input type="number" id="debt-start-balance" required step="0.01">
html = html.replace(
    '<input type="number" id="debt-start-balance" required step="0.01">\n                    </div>',
    '<input type="number" id="debt-start-balance" required step="0.01">\n                    </div>\n' + icon_selector_html
)

# Wire up the '+' button
html = html.replace(
    '<button class="btn" style="border-radius: 50%;',
    '<button class="btn" onclick="openDebtModal()" style="border-radius: 50%;'
)

with open(html_path, 'w') as f:
    f.write(html)

print("HTML Patched.")

# Now patch app.js
app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

# 1. Update the Icon Selector Logic in app.js
icon_logic = """
// Icon Selector Logic
let selectedDebtIcon = 'credit_card';
document.addEventListener('DOMContentLoaded', () => {
    const iconOptions = document.querySelectorAll('.icon-option');
    iconOptions.forEach(opt => {
        opt.addEventListener('click', (e) => {
            iconOptions.forEach(o => o.style.border = '2px solid transparent');
            const target = e.currentTarget;
            target.style.border = '2px solid #3d5a80';
            selectedDebtIcon = target.getAttribute('data-icon');
        });
    });
});
"""

# Insert near the top
app = app.replace("const API_BASE = window.location.hostname", icon_logic + "\nconst API_BASE = window.location.hostname")

# Modify openDebtModal
app = app.replace("document.getElementById('debt-start-balance').value = '';", "document.getElementById('debt-start-balance').value = '';\n    selectedDebtIcon = 'credit_card';\n    document.querySelectorAll('.icon-option').forEach(o => o.style.border = '2px solid transparent');\n    document.querySelector('.icon-option[data-icon=\"credit_card\"]').style.border = '2px solid #3d5a80';")

# Modify edit functionality to load icon
app = app.replace("document.getElementById('debt-start-balance').value = debt.start_balance;", "document.getElementById('debt-start-balance').value = debt.start_balance;\n    selectedDebtIcon = debt.icon_type || 'credit_card';\n    document.querySelectorAll('.icon-option').forEach(o => o.style.border = '2px solid transparent');\n    const opt = document.querySelector(`.icon-option[data-icon=\"${selectedDebtIcon}\"]`);\n    if(opt) opt.style.border = '2px solid #3d5a80';")

# Include icon_type in saveDebt
app = app.replace("start_balance: document.getElementById('debt-start-balance').value", "start_balance: document.getElementById('debt-start-balance').value,\n        icon_type: selectedDebtIcon")


with open(app_js_path, 'w') as f:
    f.write(app)

print("App JS Icon logic patched.")
