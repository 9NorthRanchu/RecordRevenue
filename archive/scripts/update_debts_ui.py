import re

# 1. HTML FILE
html_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/index.html"
with open(html_path, 'r') as f:
    html = f.read()

# Replace button action
old_btn = 'onclick="openDebtModal()"'
new_btn = 'onclick="document.getElementById(\'nav-settings\').click(); setTimeout(() => openSettingModal(\'account\'), 500);"'
html = html.replace(old_btn, new_btn)

# Replace tabs
old_tabs = """<div class="tabs" style="display: flex; gap: 10px; margin-bottom: 15px;">
                                <button class="btn btn-outline active" id="tab-payable" onclick="switchDebtTab('PAYABLE')" style="flex: 1; border-radius: 10px; background: #e0fbfc; color: #3d5a80; border: none; box-shadow: inset 2px 2px 5px rgba(162, 210, 255, 0.3), inset -2px -2px 5px #fff; font-weight: bold; padding: 8px;">ต้องจ่าย</button>
                                <button class="btn btn-outline" id="tab-receivable" onclick="switchDebtTab('RECEIVABLE')" style="flex: 1; border-radius: 10px; background: transparent; color: #7f8c8d; border: none; box-shadow: 3px 3px 8px rgba(0,0,0,0.05), -3px -3px 8px #fff; padding: 8px;">ให้กู้ยืม</button>
                            </div>"""
new_tabs = """<div class="tabs" style="display: flex; gap: 10px; margin-bottom: 15px;">
                                <button class="btn btn-outline active" id="tab-receivable" onclick="switchDebtTab('RECEIVABLE')" style="flex: 1; border-radius: 10px; background: linear-gradient(135deg, #10b981, #34d399); color: white; border: none; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.3); font-weight: bold; padding: 8px; cursor: pointer; transition: all 0.2s;">Receivable</button>
                                <button class="btn btn-outline" id="tab-payable" onclick="switchDebtTab('PAYABLE')" style="flex: 1; border-radius: 10px; background: transparent; color: #64748b; border: 1px solid #cbd5e1; padding: 8px; cursor: pointer; transition: all 0.2s;">Payable</button>
                            </div>"""
if old_tabs in html:
    html = html.replace(old_tabs, new_tabs)
else:
    print("Warning: old_tabs not found in HTML!")

with open(html_path, 'w') as f:
    f.write(html)


# 2. JS FILE
app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

# Update currentDebtTab
app = app.replace("let currentDebtTab = 'PAYABLE';", "let currentDebtTab = 'RECEIVABLE';")

# Update switchDebtTab
old_switch = """function switchDebtTab(tab) {
    currentDebtTab = tab;
    document.querySelectorAll('.debts-dashboard .tabs button').forEach(btn => btn.classList.remove('active'));
    if(tab === 'PAYABLE') document.getElementById('tab-payable').classList.add('active');
    else document.getElementById('tab-receivable').classList.add('active');
    renderDebtsDashboard();
}"""
new_switch = """function switchDebtTab(tab) {
    currentDebtTab = tab;
    const tabRec = document.getElementById('tab-receivable');
    const tabPay = document.getElementById('tab-payable');
    
    if (tabRec && tabPay) {
        tabRec.style.background = 'transparent';
        tabRec.style.color = '#64748b';
        tabRec.style.border = '1px solid #cbd5e1';
        tabRec.style.boxShadow = 'none';
        tabRec.style.fontWeight = 'normal';
        
        tabPay.style.background = 'transparent';
        tabPay.style.color = '#64748b';
        tabPay.style.border = '1px solid #cbd5e1';
        tabPay.style.boxShadow = 'none';
        tabPay.style.fontWeight = 'normal';
        
        if(tab === 'RECEIVABLE') {
            tabRec.style.background = 'linear-gradient(135deg, #10b981, #34d399)';
            tabRec.style.color = 'white';
            tabRec.style.border = 'none';
            tabRec.style.boxShadow = '0 4px 6px rgba(16, 185, 129, 0.3)';
            tabRec.style.fontWeight = 'bold';
        } else {
            tabPay.style.background = 'linear-gradient(135deg, #f43f5e, #fb7185)';
            tabPay.style.color = 'white';
            tabPay.style.border = 'none';
            tabPay.style.boxShadow = '0 4px 6px rgba(244, 63, 94, 0.3)';
            tabPay.style.fontWeight = 'bold';
        }
    }
    renderDebtsDashboard();
}"""
app = app.replace(old_switch, new_switch)


# Regex replace renderDebtsDashboard
pattern = re.compile(r"function renderDebtsDashboard\(\) \{.*?\nasync function viewDebtDetails", re.DOTALL)

new_render = """function renderDebtsDashboard() {
    const listContainer = document.getElementById('debts-sidebar-list');
    if (!listContainer) return;
    
    // Filter by tab
    const filtered = AppState.debts.filter(d => d.type === currentDebtTab && d.status === 'active');
    
    let totalStartBalance = 0;
    let totalPaidOverall = 0;
    
    listContainer.innerHTML = filtered.map(debt => {
        const contact = (AppState.contacts || []).find(c => c.contact_id === debt.contact_id);
        const icon = debt.icon_type || 'credit_card';
        
        let iconHtml = '';
        let bgColor = '#a2d2ff'; // default blue
        if(icon === 'car') { iconHtml = 'fa-car'; bgColor = '#ffb5a7'; }
        else if(icon === 'house') { iconHtml = 'fa-house'; bgColor = '#bde0fe'; }
        else if(icon === 'personal') { iconHtml = 'fa-sack-dollar'; bgColor = '#ffd6a5'; }
        else if(icon === 'student') { iconHtml = 'fa-graduation-cap'; bgColor = '#caffbf'; }
        else { iconHtml = 'fa-credit-card'; bgColor = '#a2d2ff'; }
        
        const txs = window.getDebtTransactions(debt);
        const paidAmount = txs.reduce((sum, t) => sum + (t.principal || 0), 0);
        const balance = debt.start_balance - paidAmount;
        
        totalStartBalance += debt.start_balance;
        totalPaidOverall += paidAmount;
        
        let progressPct = debt.start_balance > 0 ? (paidAmount / debt.start_balance) * 100 : 0;
        if(progressPct > 100) progressPct = 100;

        const barGradient = currentDebtTab === 'RECEIVABLE' ? '#34d399, #10b981' : '#fb7185, #f43f5e';

        return `
            <div class="debt-card neumorph-card" onclick="viewDebtDetails('${(debt.debt_id || debt.id)}')" style="cursor: pointer; padding: 12px; border-radius: 15px; background: rgba(255,255,255,0.9); display: flex; align-items: center; justify-content: space-between; transition: all 0.2s; border: 1px solid #e2e8f0; margin-bottom: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                <div style="display: flex; gap: 12px; align-items: center; width: 100%;">
                    <div style="width: 45px; height: 45px; border-radius: 12px; background: ${bgColor}; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1), inset 0 2px 4px rgba(255,255,255,0.5);">
                        <i class="fa-solid ${iconHtml}" style="color: #1e293b; font-size: 1.2rem;"></i>
                    </div>
                    <div style="flex: 1;">
                        <div style="display: flex; justify-content: space-between;">
                            <h4 style="margin: 0; color: #1e293b; font-size: 0.95rem; font-weight: 700;">${debt.name}</h4>
                            <span style="font-weight: 700; color: #3b82f6;">${formatCurrency(balance)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-top: 2px;">
                            <span style="color: #64748b; font-weight: 500;">${contact ? contact.name : 'Unknown'}</span>
                            <span style="color: #10b981; font-weight: 600;"><i class="fa-solid fa-check"></i> ${debt.status}</span>
                        </div>
                        <div style="margin-top: 8px; width: 100%; height: 8px; background: rgba(226, 232, 240, 0.7); border-radius: 4px; overflow: hidden; position: relative; box-shadow: inset 0 1px 2px rgba(0,0,0,0.05); border: 1px solid rgba(255,255,255,0.6);">
                            <div style="width: ${progressPct}%; height: 100%; background: linear-gradient(90deg, ${barGradient}); border-radius: 4px; position: relative; overflow: hidden;">
                                <div style="position: absolute; top: 0; left: 0; width: 100%; height: 50%; background: linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 100%);"></div>
                            </div>
                        </div>
                        <div style="font-size: 0.65rem; color: #94a3b8; text-align: right; margin-top: 4px; font-weight: 600;">${progressPct.toFixed(0)}% Paid</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (filtered.length === 0) {
        listContainer.innerHTML = `<div style="text-align:center; padding: 20px; color: #94a3b8; font-weight: 500;">ไม่มีข้อมูล</div>`;
    }
    
    // Update Summary Chart
    const summaryChart = document.getElementById('debt-summary-chart');
    if (summaryChart) {
        let paidPct = totalStartBalance > 0 ? (totalPaidOverall / totalStartBalance) * 100 : 0;
        let remPct = 100 - paidPct;
        
        let primaryColor = currentDebtTab === 'RECEIVABLE' ? '#10b981' : '#f43f5e';
        let secondaryColor = currentDebtTab === 'RECEIVABLE' ? '#d1fae5' : '#ffe4e6';
        let gradientStr = `conic-gradient(${primaryColor} 0% ${paidPct}%, ${secondaryColor} ${paidPct}% 100%)`;
        
        summaryChart.innerHTML = `
            <h4 style="margin: 0 0 10px 0; color: #1e293b; font-size: 1rem; font-weight: 700;">Summary</h4>
            <div style="display: flex; align-items: center; gap: 20px;">
                <div style="position: relative; width: 75px; height: 75px; border-radius: 50%; background: ${gradientStr}; box-shadow: 0 4px 10px rgba(0,0,0,0.1), inset 0 2px 4px rgba(255,255,255,0.8);">
                    <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; border-radius: 50%; background: linear-gradient(135deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 50%, rgba(255,255,255,0.1) 100%); pointer-events: none;"></div>
                    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 45px; height: 45px; border-radius: 50%; background: #f8fafc; box-shadow: inset 0 2px 4px rgba(0,0,0,0.1), 0 2px 4px rgba(255,255,255,0.8); display: flex; align-items: center; justify-content: center;"></div>
                </div>
                <div style="font-size: 0.85rem; color: #475569; font-weight: 600;">
                    <div style="margin-bottom: 8px; display: flex; align-items: center;"><span style="display:inline-block; width:12px; height:12px; background:${primaryColor}; border-radius:50%; margin-right:8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"></span> จ่ายแล้ว ${formatCurrency(totalPaidOverall)}</div>
                    <div style="display: flex; align-items: center;"><span style="display:inline-block; width:12px; height:12px; background:${secondaryColor}; border-radius:50%; margin-right:8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border: 1px solid #cbd5e1;"></span> คงเหลือ ${formatCurrency(totalStartBalance - totalPaidOverall)}</div>
                </div>
            </div>
        `;
    }
}

async function viewDebtDetails"""

app = pattern.sub(new_render, app)
with open(app_js_path, 'w') as f:
    f.write(app)

print("Update JS complete")
