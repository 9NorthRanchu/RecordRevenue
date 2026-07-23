import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

# Helper function to find function body
def replace_function(content, func_name, new_func_code):
    pattern = rf"async function {func_name}\([^)]*\)\s*{{.*?^}}"
    match = re.search(pattern, content, re.MULTILINE | re.DOTALL)
    if match:
        return content[:match.start()] + new_func_code + content[match.end():]
    return content

new_render_debts = """async function renderDebtsDashboard() {
    const listContainer = document.getElementById('debts-sidebar-list');
    if (!listContainer) return;
    
    // Filter by tab
    const filtered = allDebts.filter(d => d.type === currentDebtTab && d.status === 'active');
    
    let totalStartBalance = 0;
    let totalPaidOverall = 0;
    
    listContainer.innerHTML = filtered.map(debt => {
        const contact = getContact(debt.contact_id);
        const icon = debt.icon_type || 'credit_card';
        
        let iconHtml = '';
        let bgColor = '#a2d2ff'; // default blue
        if(icon === 'car') { iconHtml = 'fa-car'; bgColor = '#ffb5a7'; }
        else if(icon === 'house') { iconHtml = 'fa-house'; bgColor = '#bde0fe'; }
        else if(icon === 'personal') { iconHtml = 'fa-sack-dollar'; bgColor = '#ffd6a5'; }
        else if(icon === 'student') { iconHtml = 'fa-graduation-cap'; bgColor = '#caffbf'; }
        else { iconHtml = 'fa-credit-card'; bgColor = '#a2d2ff'; }
        
        const txs = window.debtsHistoryCache[debt.debt_id] || [];
        const paidAmount = txs.reduce((sum, t) => sum + (t.principal || 0), 0);
        const balance = debt.start_balance - paidAmount;
        
        totalStartBalance += debt.start_balance;
        totalPaidOverall += paidAmount;
        
        let progressPct = debt.start_balance > 0 ? (paidAmount / debt.start_balance) * 100 : 0;
        if(progressPct > 100) progressPct = 100;

        return `
            <div class="debt-card neumorph-card" onclick="viewDebtDetails('${debt.debt_id}')" style="cursor: pointer; padding: 12px; border-radius: 15px; background: rgba(255,255,255,0.8); display: flex; align-items: center; justify-content: space-between; transition: all 0.2s; border: 1px solid rgba(255,255,255,1);">
                <div style="display: flex; gap: 12px; align-items: center; width: 100%;">
                    <div style="width: 45px; height: 45px; border-radius: 12px; background: ${bgColor}; display: flex; align-items: center; justify-content: center; box-shadow: 2px 2px 5px rgba(0,0,0,0.1), inset -2px -2px 5px rgba(255,255,255,0.5);">
                        <i class="fa-solid ${iconHtml}" style="color: #2c3e50; font-size: 1.2rem;"></i>
                    </div>
                    <div style="flex: 1;">
                        <div style="display: flex; justify-content: space-between;">
                            <h4 style="margin: 0; color: #2c3e50; font-size: 0.95rem;">${debt.name}</h4>
                            <span style="font-weight: bold; color: #3d5a80;">${formatCurrency(balance)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-top: 2px;">
                            <span style="color: #74b9ff; font-weight: 500;">${contact ? contact.name : 'Unknown'}</span>
                            <span style="color: #27ae60;"><i class="fa-solid fa-check"></i> ${debt.status}</span>
                        </div>
                        <div style="margin-top: 6px; width: 100%; height: 6px; background: #e0fbfc; border-radius: 3px; overflow: hidden; position: relative;">
                            <div style="width: ${progressPct}%; height: 100%; background: linear-gradient(90deg, #a2d2ff, #74b9ff); border-radius: 3px;"></div>
                        </div>
                        <div style="font-size: 0.65rem; color: #7f8c8d; text-align: right; margin-top: 2px;">${progressPct.toFixed(0)}% Paid</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (filtered.length === 0) {
        listContainer.innerHTML = `<div style="text-align:center; padding: 20px; color: #95a5a6;">ไม่มีข้อมูล</div>`;
    }
    
    // Update Summary Chart
    const summaryChart = document.getElementById('debt-summary-chart');
    if (summaryChart) {
        let paidPct = totalStartBalance > 0 ? (totalPaidOverall / totalStartBalance) * 100 : 0;
        let remPct = 100 - paidPct;
        
        let gradientStr = `conic-gradient(#a2d2ff 0% ${paidPct}%, #ffb5a7 ${paidPct}% 100%)`;
        
        summaryChart.innerHTML = `
            <h4 style="margin: 0 0 10px 0; color: #3d5a80; font-size: 0.9rem;">Summary</h4>
            <div style="display: flex; align-items: center; gap: 15px;">
                <div style="width: 60px; height: 60px; border-radius: 50%; background: ${gradientStr}; box-shadow: 3px 3px 8px rgba(0,0,0,0.1), -3px -3px 8px #fff;"></div>
                <div style="font-size: 0.8rem; color: #666;">
                    <div style="margin-bottom: 4px;"><span style="display:inline-block; width:8px; height:8px; background:#a2d2ff; border-radius:50%; margin-right:5px;"></span> จ่ายแล้ว ${formatCurrency(totalPaidOverall)}</div>
                    <div><span style="display:inline-block; width:8px; height:8px; background:#ffb5a7; border-radius:50%; margin-right:5px;"></span> คงเหลือ ${formatCurrency(totalStartBalance - totalPaidOverall)}</div>
                </div>
            </div>
        `;
    }
}"""

new_view_debt = """async function viewDebtDetails(debtId) {
    const debt = allDebts.find(d => d.debt_id === debtId);
    if (!debt) return;
    
    document.getElementById('debt-empty-state').style.display = 'none';
    const panel = document.getElementById('debt-details-panel');
    panel.style.display = 'block';
    
    const contact = getContact(debt.contact_id);
    const txs = window.debtsHistoryCache[debtId] || [];
    
    // Sort transactions by date descending
    txs.sort((a,b) => new Date(b.date) - new Date(a.date));
    
    const paidPrincipal = txs.reduce((sum, t) => sum + (t.principal || 0), 0);
    const paidInterest = txs.reduce((sum, t) => sum + (t.interest || 0), 0);
    const balance = debt.start_balance - paidPrincipal;
    
    // Get unique years for filter
    const years = [...new Set(txs.map(t => t.date.substring(0,4)))].sort((a,b) => b - a);
    const yearOptions = years.map(y => `<option value="${y}">${y}</option>`).join('');

    let txRows = txs.map(t => `
        <tr class="tx-row" data-year="${t.date.substring(0,4)}">
            <td style="padding: 8px 12px; border-bottom: 1px dashed rgba(162, 210, 255, 0.4);">${t.date}</td>
            <td style="padding: 8px 12px; border-bottom: 1px dashed rgba(162, 210, 255, 0.4); color: #7f8c8d; font-size: 0.85rem;">${t.statement_desc || '-'}</td>
            <td style="padding: 8px 12px; border-bottom: 1px dashed rgba(162, 210, 255, 0.4); font-weight: bold;">${formatCurrency((t.principal||0) + (t.interest||0))}</td>
            <td style="padding: 8px 12px; border-bottom: 1px dashed rgba(162, 210, 255, 0.4); color: #2c3e50;">${formatCurrency(t.principal || 0)}</td>
            <td style="padding: 8px 12px; border-bottom: 1px dashed rgba(162, 210, 255, 0.4); color: #d35400;">${formatCurrency(t.interest || 0)}</td>
            <td style="padding: 8px 12px; border-bottom: 1px dashed rgba(162, 210, 255, 0.4); color: #27ae60;"><i class="fa-solid fa-circle-check"></i></td>
        </tr>
    `).join('');
    
    if(txs.length === 0) {
        txRows = `<tr><td colspan="6" style="text-align:center; padding: 20px; color: #95a5a6;">ไม่มีประวัติการชำระ</td></tr>`;
    }

    panel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
            <div>
                <h2 style="margin: 0; color: #2c3e50; font-weight: bold; font-size: 1.5rem;">${debt.name}</h2>
                <div style="color: #ffb5a7; margin-top: 5px; font-weight: 500;"><i class="fa-solid fa-user"></i> ${contact ? contact.name : 'Unknown'}</div>
            </div>
            <div style="display: flex; gap: 10px;">
                <button class="btn btn-outline" onclick="openDebtModal('${debt.debt_id}')" style="border-radius: 10px; background: transparent; color: #3d5a80; border: 1px solid #3d5a80;"><i class="fa-solid fa-pen"></i> Edit</button>
            </div>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 20px;">
            <div style="background: rgba(255,255,255,0.6); padding: 15px; border-radius: 15px; border: 1px solid #fff;">
                <div style="font-size: 0.8rem; color: #7f8c8d; margin-bottom: 5px;">ยอดคงเหลือปัจจุบัน</div>
                <div style="font-size: 1.5rem; font-weight: bold; color: #3d5a80;">${formatCurrency(balance)}</div>
            </div>
            <div style="background: rgba(255,255,255,0.6); padding: 15px; border-radius: 15px; border: 1px solid #fff;">
                <div style="font-size: 0.8rem; color: #7f8c8d; margin-bottom: 5px;">เงินต้นชำระแล้ว (Total Principal)</div>
                <div style="font-size: 1.5rem; font-weight: bold; color: #27ae60;">${formatCurrency(paidPrincipal)}</div>
            </div>
            <div style="background: rgba(255,255,255,0.6); padding: 15px; border-radius: 15px; border: 1px solid #fff;">
                <div style="font-size: 0.8rem; color: #7f8c8d; margin-bottom: 5px;">ดอกเบี้ยจ่าย (Total Interest)</div>
                <div style="font-size: 1.5rem; font-weight: bold; color: #d35400;">${formatCurrency(paidInterest)}</div>
            </div>
        </div>
        
        <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h4 style="margin:0; color: #3d5a80;"><i class="fa-solid fa-clock-rotate-left"></i> PAYMENT HISTORY</h4>
                <select id="year-filter" onchange="filterDebtHistory()" style="padding: 5px 10px; border-radius: 8px; border: 1px solid #a2d2ff; background: #fff; color: #3d5a80; outline: none;">
                    <option value="ALL">All Years</option>
                    ${yearOptions}
                </select>
            </div>
            <div style="background: rgba(255,255,255,0.8); border-radius: 15px; overflow: hidden; border: 1px solid #fff;">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                    <thead>
                        <tr style="background: rgba(162, 210, 255, 0.2); color: #3d5a80; text-align: left;">
                            <th style="padding: 10px 12px;">Date</th>
                            <th style="padding: 10px 12px;">Statement</th>
                            <th style="padding: 10px 12px;">Amount</th>
                            <th style="padding: 10px 12px;">Principal</th>
                            <th style="padding: 10px 12px;">Interest</th>
                            <th style="padding: 10px 12px;">Status</th>
                        </tr>
                    </thead>
                    <tbody id="debt-tx-tbody">
                        ${txRows}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// Global function to filter by year
window.filterDebtHistory = function() {
    const year = document.getElementById('year-filter').value;
    const rows = document.querySelectorAll('#debt-tx-tbody .tx-row');
    rows.forEach(row => {
        if(year === 'ALL' || row.getAttribute('data-year') === year) {
            row.style.display = 'table-row';
        } else {
            row.style.display = 'none';
        }
    });
};
"""

app = replace_function(app, "renderDebtsDashboard", new_render_debts)
app = replace_function(app, "viewDebtDetails", new_view_debt)

# Add window.filterDebtHistory if it's not captured by regex
if "window.filterDebtHistory" not in app:
    app += "\nwindow.filterDebtHistory = function() {\n    const year = document.getElementById('year-filter').value;\n    const rows = document.querySelectorAll('#debt-tx-tbody .tx-row');\n    rows.forEach(row => {\n        if(year === 'ALL' || row.getAttribute('data-year') === year) {\n            row.style.display = 'table-row';\n        } else {\n            row.style.display = 'none';\n        }\n    });\n};\n"

with open(app_js_path, 'w') as f:
    f.write(app)

print("App JS UI patched.")
