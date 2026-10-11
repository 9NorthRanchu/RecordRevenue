import re

html_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/index.html"
with open(html_path, 'r') as f:
    html = f.read()

# Add to index.html
hidden_input = '<input type="hidden" id="debt-id">'
new_hidden = '<input type="hidden" id="debt-id">\n                    <input type="hidden" id="debt-icon-type" value="zodiac_1.png">'
html = html.replace(hidden_input, new_hidden)

contact_group = """                    <div class="form-group" style="margin-top: 10px;">
                        <label style="font-size: 0.85rem; font-weight: 600; color: #475569; margin-bottom: 5px;">Contact</label>
                        <select id="debt-contact" class="form-control" style="background: rgba(255,255,255,0.7); border-radius: 8px;" required></select>
                    </div>"""

icon_selector = """
                    <div class="form-group" style="margin-top: 10px;">
                        <label style="font-size: 0.85rem; font-weight: 600; color: #475569; margin-bottom: 5px;">Icon Style</label>
                        <div style="background: rgba(255,255,255,0.7); border-radius: 8px; padding: 10px;">
                            <div class="icon-tabs" style="display: flex; gap: 5px; margin-bottom: 10px; overflow-x: auto;">
                                <button type="button" class="btn btn-sm btn-outline active" onclick="switchIconTab('zodiac')" style="border-radius: 15px; font-size: 0.7rem; padding: 2px 8px;">Zodiac</button>
                                <button type="button" class="btn btn-sm btn-outline" onclick="switchIconTab('hokkaido')" style="border-radius: 15px; font-size: 0.7rem; padding: 2px 8px;">Hokkaido</button>
                                <button type="button" class="btn btn-sm btn-outline" onclick="switchIconTab('china')" style="border-radius: 15px; font-size: 0.7rem; padding: 2px 8px;">China</button>
                                <button type="button" class="btn btn-sm btn-outline" onclick="switchIconTab('japan')" style="border-radius: 15px; font-size: 0.7rem; padding: 2px 8px;">Japan</button>
                            </div>
                            <div id="icon-grid" style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 5px; max-height: 120px; overflow-y: auto;">
                                <!-- Rendered by JS -->
                            </div>
                        </div>
                    </div>"""

html = html.replace(contact_group, contact_group + icon_selector)

with open(html_path, 'w') as f:
    f.write(html)

print("HTML patched.")


# 2. Patch app.js
app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

# Add icon logic at the top of app.js (after document.addEventListener)
icon_js = """
// Icon Selector Logic
const ICON_SETS = {
    zodiac: Array.from({length: 12}, (_, i) => `zodiac_${i+1}.png`),
    hokkaido: Array.from({length: 12}, (_, i) => `hokkaido_${i+1}.png`),
    china: Array.from({length: 12}, (_, i) => `china_${i+1}.png`),
    japan: Array.from({length: 12}, (_, i) => `japan_${i+1}.png`)
};
let currentIconTab = 'zodiac';
let selectedIcon = 'zodiac_1.png';

function switchIconTab(tab) {
    currentIconTab = tab;
    const tabs = document.querySelectorAll('.icon-tabs button');
    tabs.forEach(btn => {
        btn.style.background = 'transparent';
        btn.style.color = '#3b82f6';
    });
    const activeBtn = document.querySelector(`.icon-tabs button[onclick="switchIconTab('${tab}')"]`);
    if(activeBtn) {
        activeBtn.style.background = '#3b82f6';
        activeBtn.style.color = 'white';
    }
    renderIconGrid();
}

function renderIconGrid() {
    const grid = document.getElementById('icon-grid');
    if (!grid) return;
    grid.innerHTML = ICON_SETS[currentIconTab].map(icon => `
        <div onclick="selectIcon('${icon}')" style="cursor:pointer; border-radius: 8px; padding: 2px; border: 2px solid ${selectedIcon === icon ? '#3b82f6' : 'transparent'}; text-align: center; transition: all 0.2s;">
            <img src="/assets/icons/${icon}" style="width: 100%; height: auto; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        </div>
    `).join('');
}

function selectIcon(icon) {
    selectedIcon = icon;
    const iconInput = document.getElementById('debt-icon-type');
    if(iconInput) iconInput.value = icon;
    renderIconGrid();
}
"""

if "// Icon Selector Logic" not in app:
    app = app.replace("document.addEventListener('DOMContentLoaded', () => {", icon_js + "\n\ndocument.addEventListener('DOMContentLoaded', () => {")


# Update showDebtModal
old_show = """function showDebtModal(id = null) {
    document.getElementById('debt-modal').classList.remove('hidden');
    
    // Populate dropdowns"""
new_show = """function showDebtModal(id = null) {
    document.getElementById('debt-modal').classList.remove('hidden');
    
    // Populate dropdowns"""
app = app.replace(old_show, new_show)

old_show_reset = """        document.getElementById('debt-installment').value = '';
        document.getElementById('debt-start-date').value = '';
    }"""
new_show_reset = """        document.getElementById('debt-installment').value = '';
        document.getElementById('debt-start-date').value = '';
        
        document.getElementById('debt-icon-type').value = 'zodiac_1.png';
        selectedIcon = 'zodiac_1.png';
        switchIconTab('zodiac');
    }"""
app = app.replace(old_show_reset, new_show_reset)

old_show_edit = """        document.getElementById('debt-start-balance').value = formatCurrency(debt.start_balance);
        document.getElementById('debt-installment').value = debt.installment_amount ? formatCurrency(debt.installment_amount) : '';
        document.getElementById('debt-start-date').value = debt.start_date || '';
    }"""
new_show_edit = """        document.getElementById('debt-start-balance').value = formatCurrency(debt.start_balance);
        document.getElementById('debt-installment').value = debt.installment_amount ? formatCurrency(debt.installment_amount) : '';
        document.getElementById('debt-start-date').value = debt.start_date || '';
        
        const iType = debt.icon_type || 'zodiac_1.png';
        document.getElementById('debt-icon-type').value = iType;
        selectedIcon = iType;
        if(iType.startsWith('hokkaido')) switchIconTab('hokkaido');
        else if(iType.startsWith('china')) switchIconTab('china');
        else if(iType.startsWith('japan')) switchIconTab('japan');
        else switchIconTab('zodiac');
    }"""
app = app.replace(old_show_edit, new_show_edit)


# Update saveDebtProfile
old_save_payload = """        start_date: document.getElementById('debt-start-date').value || null,
        principal_category_id: document.getElementById('debt-principal-category').value || null,
        interest_category_id: document.getElementById('debt-interest-category').value || null
    };"""
new_save_payload = """        start_date: document.getElementById('debt-start-date').value || null,
        principal_category_id: document.getElementById('debt-principal-category').value || null,
        interest_category_id: document.getElementById('debt-interest-category').value || null,
        icon_type: document.getElementById('debt-icon-type').value || 'zodiac_1.png'
    };"""
app = app.replace(old_save_payload, new_save_payload)


# Update renderDebtsDashboard
old_render = """        const contact = (AppState.contacts || []).find(c => c.contact_id === debt.contact_id);
        const icon = debt.icon_type || 'credit_card';
        
        let iconHtml = '';
        let bgColor = '#a2d2ff'; // default blue
        if(icon === 'car') { iconHtml = 'fa-car'; bgColor = '#ffb5a7'; }
        else if(icon === 'house') { iconHtml = 'fa-house'; bgColor = '#bde0fe'; }
        else if(icon === 'personal') { iconHtml = 'fa-sack-dollar'; bgColor = '#ffd6a5'; }
        else if(icon === 'student') { iconHtml = 'fa-graduation-cap'; bgColor = '#caffbf'; }
        else { iconHtml = 'fa-credit-card'; bgColor = '#a2d2ff'; }"""
new_render = """        const contact = (AppState.contacts || []).find(c => c.contact_id === debt.contact_id);
        const icon = debt.icon_type || 'zodiac_1.png';
        
        let innerIcon = '';
        let bgColor = '#a2d2ff'; // default blue
        
        if (icon.endsWith('.png')) {
            innerIcon = `<img src="/assets/icons/${icon}" style="width: 100%; height: 100%; border-radius: 12px; object-fit: cover;">`;
            bgColor = 'transparent';
        } else {
            let iconHtml = '';
            if(icon === 'car') { iconHtml = 'fa-car'; bgColor = '#ffb5a7'; }
            else if(icon === 'house') { iconHtml = 'fa-house'; bgColor = '#bde0fe'; }
            else if(icon === 'personal') { iconHtml = 'fa-sack-dollar'; bgColor = '#ffd6a5'; }
            else if(icon === 'student') { iconHtml = 'fa-graduation-cap'; bgColor = '#caffbf'; }
            else { iconHtml = 'fa-credit-card'; bgColor = '#a2d2ff'; }
            innerIcon = `<i class="fa-solid ${iconHtml}" style="color: #1e293b; font-size: 1.2rem;"></i>`;
        }"""
app = app.replace(old_render, new_render)

# Replace <i class="fa-solid ${iconHtml}" style="color: #1e293b; font-size: 1.2rem;"></i> with ${innerIcon}
old_icon_div = """<div style="width: 45px; height: 45px; border-radius: 12px; background: ${bgColor}; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1), inset 0 2px 4px rgba(255,255,255,0.5);">
                        <i class="fa-solid ${iconHtml}" style="color: #1e293b; font-size: 1.2rem;"></i>
                    </div>"""
new_icon_div = """<div style="width: 45px; height: 45px; border-radius: 12px; background: ${bgColor}; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1), inset 0 2px 4px rgba(255,255,255,0.5);">
                        ${innerIcon}
                    </div>"""
app = app.replace(old_icon_div, new_icon_div)


with open(app_js_path, 'w') as f:
    f.write(app)

print("JS patched.")
