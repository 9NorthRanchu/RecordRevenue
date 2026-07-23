import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

# Fix renderDebtList icon
new_icon_logic = """        let innerIcon = '';
        let bgColor = '#a2d2ff'; // default blue
        
        if (icon.endsWith('.png')) {
            innerIcon = `<img src="/assets/icons/${icon}" style="width: 100%; height: 100%; border-radius: 12px; object-fit: contain;">`;
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
old_icon_logic = """        let iconElement = '';
        let bgColor = '#a2d2ff'; // default blue
        
        if (icon.endsWith('.png')) {
            iconElement = `<img src="/assets/icons/${icon}" style="width: 46px; height: 46px; object-fit: contain; margin-top: 2px;">`;
        } else {
            let iconHtml = '';
            if(icon === 'car') { iconHtml = 'fa-car'; bgColor = '#ffb5a7'; }
            else if(icon === 'house') { iconHtml = 'fa-house'; bgColor = '#bde0fe'; }
            else if(icon === 'personal') { iconHtml = 'fa-sack-dollar'; bgColor = '#ffd6a5'; }
            else if(icon === 'student') { iconHtml = 'fa-graduation-cap'; bgColor = '#caffbf'; }
            else { iconHtml = 'fa-credit-card'; bgColor = '#a2d2ff'; }
            iconElement = `<div style="width: 42px; height: 42px; border-radius: 12px; background: ${bgColor}; display: flex; align-items: center; justify-content: center; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1), inset 0 2px 4px rgba(255,255,255,0.5); margin-top: 2px;"><i class="fa-solid ${iconHtml}" style="color: #1e293b; font-size: 1.2rem;"></i></div>`;
        }"""

app = app.replace(old_icon_logic, new_icon_logic)

new_card = """                    <div style="width: 42px; height: 42px; border-radius: 12px; background: ${bgColor}; display: flex; align-items: center; justify-content: center; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1), inset 0 2px 4px rgba(255,255,255,0.5); margin-top: 2px;">
                        ${innerIcon}
                    </div>"""
old_card = """                    ${iconElement}"""
app = app.replace(old_card, new_card)

# Fix viewDebtDetail header icon
new_header_logic = """    let headerIconHtml = '';
    if (iconType.endsWith('.png')) {
        headerIconHtml = `<div style="width: 38px; height: 38px; border-radius: 10px; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; background: rgba(255,255,255,0.8); border: 1px solid rgba(226,232,240,0.8); box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-right: 4px;">
            <img src="/assets/icons/${iconType}" style="width: 100%; height: 100%; object-fit: contain;">
        </div>`;
    } else {
        headerIconHtml = `<i class="fa-solid ${iconHtml}" style="color: #3b82f6; -webkit-text-fill-color: initial;"></i>`;
    }"""
old_header_logic = """    let headerIconHtml = '';
    if (iconType.endsWith('.png')) {
        headerIconHtml = `<img src="/assets/icons/${iconType}" style="width: 42px; height: 42px; object-fit: contain; margin-right: 4px;">`;
    } else {
        headerIconHtml = `<i class="fa-solid ${iconHtml}" style="color: #3b82f6; -webkit-text-fill-color: initial;"></i>`;
    }"""

app = app.replace(old_header_logic, new_header_logic)

with open(app_js_path, 'w') as f:
    f.write(app)
print("Icons reverted successfully")
