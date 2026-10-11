import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

# Fix 1: d.id -> d.debt_id in renderDebtsSettings
app = app.replace('onclick="showDebtModal(${d.id})"', "onclick=\\\"showDebtModal('${d.debt_id}')\\\"")
app = app.replace('onclick="deleteDebtProfile(${d.id})"', "onclick=\\\"deleteDebtProfile('${d.debt_id}')\\\"")

# Fix 2: DOM manipulation in showDebtModal
old_modal = """    // Populate dropdowns
    const contactSel = document.getElementById('debt-contact');
    contactSel.innerHTML = '<option value="">-- ไม่ระบุ --</option>';
    AppState.contacts.forEach(c => {
        contactSel.innerHTML += `<option value="${c.contact_id}">${c.name}</option>`;
    });
    
    const prinSel = document.getElementById('debt-principal-category');
    prinSel.innerHTML = '<option value="">-- ไม่ระบุ --</option>';
    const intSel = document.getElementById('debt-interest-category');
    intSel.innerHTML = '<option value="">-- ไม่ระบุ --</option>';
    
    AppState.categories.forEach(c => {
        const opt = `<option value="${c.category_id}">${c.name}</option>`;
        prinSel.innerHTML += opt;
        intSel.innerHTML += opt;
    });"""

new_modal = """    // Populate dropdowns
    const contactSel = document.getElementById('debt-contact');
    let contactHtml = '<option value="">-- ไม่ระบุ --</option>';
    AppState.contacts.forEach(c => {
        contactHtml += `<option value="${c.contact_id}">${c.name}</option>`;
    });
    contactSel.innerHTML = contactHtml;
    
    const prinSel = document.getElementById('debt-principal-category');
    const intSel = document.getElementById('debt-interest-category');
    let prinHtml = '<option value="">-- ไม่ระบุ --</option>';
    let intHtml = '<option value="">-- ไม่ระบุ --</option>';
    
    AppState.categories.forEach(c => {
        const opt = `<option value="${c.category_id}">${c.name}</option>`;
        prinHtml += opt;
        intHtml += opt;
    });
    prinSel.innerHTML = prinHtml;
    intSel.innerHTML = intHtml;"""

app = app.replace(old_modal, new_modal)

# Fix 3: AppState.debts.find(x => x.id === id) -> x.debt_id === id
app = app.replace('const d = AppState.debts.find(x => x.id === id);', 'const d = AppState.debts.find(x => x.debt_id === id);')
app = app.replace("document.getElementById('debt-id').value = d.id;", "document.getElementById('debt-id').value = d.debt_id;")


with open(app_js_path, 'w') as f:
    f.write(app)
print("Debts modal fixed")
