import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

# Fix viewDebtDetails icon logic
old_icon_logic = """    const iconType = debt.icon_type || 'credit_card';
    let iconHtml = 'fa-credit-card';
    if(iconType === 'car') iconHtml = 'fa-car';
    else if(iconType === 'house') iconHtml = 'fa-house';
    else if(iconType === 'personal') iconHtml = 'fa-sack-dollar';
    else if(iconType === 'student') iconHtml = 'fa-graduation-cap';"""

new_icon_logic = """    const iconType = debt.icon_type || 'zodiac_1.png';
    let innerIcon = '';
    let bgColor = '#a2d2ff';
    if (iconType.endsWith('.png')) {
        innerIcon = `<img src="/assets/icons/${iconType}" style="width: 100%; height: 100%; border-radius: 16px; object-fit: cover;">`;
        bgColor = 'transparent';
    } else {
        let iconHtml = 'fa-credit-card';
        if(iconType === 'car') { iconHtml = 'fa-car'; bgColor = '#ffb5a7'; }
        else if(iconType === 'house') { iconHtml = 'fa-house'; bgColor = '#bde0fe'; }
        else if(iconType === 'personal') { iconHtml = 'fa-sack-dollar'; bgColor = '#ffd6a5'; }
        else if(iconType === 'student') { iconHtml = 'fa-graduation-cap'; bgColor = '#caffbf'; }
        innerIcon = `<i class="fa-solid ${iconHtml}" style="color: #1e293b; font-size: 2rem;"></i>`;
    }"""
app = app.replace(old_icon_logic, new_icon_logic)

# Then we need to find where the icon is rendered in viewDebtDetails
# Looking for something like <i class="fa-solid ${iconHtml}" ...> inside a div
old_header = """    panel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
            <div style="display: flex; gap: 15px; align-items: center;">
                <div style="width: 60px; height: 60px; border-radius: 16px; background: #e0f2fe; display: flex; align-items: center; justify-content: center; box-shadow: inset 0 2px 4px rgba(255,255,255,0.5), 0 4px 6px rgba(0,0,0,0.05);">
                    <i class="fa-solid ${iconHtml}" style="color: #0284c7; font-size: 1.8rem;"></i>
                </div>"""
new_header = """    panel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
            <div style="display: flex; gap: 15px; align-items: center;">
                <div style="width: 60px; height: 60px; border-radius: 16px; background: ${bgColor === 'transparent' ? 'transparent' : '#e0f2fe'}; display: flex; align-items: center; justify-content: center; box-shadow: inset 0 2px 4px rgba(255,255,255,0.5), 0 4px 6px rgba(0,0,0,0.05);">
                    ${innerIcon.replace('font-size: 1.2rem;', 'font-size: 1.8rem; color: #0284c7;')}
                </div>"""
app = app.replace(old_header, new_header)


with open(app_js_path, 'w') as f:
    f.write(app)
