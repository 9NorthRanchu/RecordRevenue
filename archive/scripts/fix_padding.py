import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

# Replace viewDebtDetails
pattern = re.compile(r"async function viewDebtDetails\(debtId\) \{.*?\};", re.DOTALL)
new_view_func = """async function viewDebtDetails(debtId) {
    const debt = AppState.debts.find(d => d.debt_id === debtId || d.id === debtId);
    if (!debt) return;
    
    document.getElementById('debt-empty-state').style.display = 'none';
    const panel = document.getElementById('debt-details-panel');
    panel.style.display = 'block';
    
    const contact = (AppState.contacts || []).find(c => c.contact_id === debt.contact_id);
    const txs = window.getDebtTransactions(debt);
    
    // Sort transactions by date descending
    txs.sort((a,b) => new Date(b.date) - new Date(a.date));
    
    const allPaidPrincipal = txs.reduce((sum, t) => sum + (t.principal || 0), 0);
    const paidPrincipal = allPaidPrincipal;
    const paidInterest = txs.reduce((sum, t) => sum + (t.interest || 0), 0);
    const totalAmount = paidPrincipal + paidInterest;
    const balance = debt.start_balance - allPaidPrincipal;
    
    // Get unique years for filter
    const years = [...new Set(txs.map(t => t.date.substring(0,4)))].sort((a,b) => b - a);
    const yearOptions = years.map(y => `<option value="${y}">${y}</option>`).join('');

    let txRows = txs.map(t => `
        <tr class="tx-row" data-year="${t.date.substring(0,4)}">
            <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; color: #1e293b; font-weight: 500;">${t.date}</td>
            <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; color: #3b82f6;">${t.statement_desc || '-'}</td>
            <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #0f172a; font-weight: 600;">${formatCurrency((t.principal||0) + (t.interest||0))}</td>
            <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; color: #10b981; text-align: right; font-weight: 500;">${formatCurrency(t.principal || 0)}</td>
            <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; color: #f59e0b; text-align: right; font-weight: 500;">${formatCurrency(t.interest || 0)}</td>
            <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; color: #22c55e; text-align: center;"><i class="fa-solid fa-circle-check"></i></td>
        </tr>
    `).join('');
    
    if(txs.length === 0) {
        txRows = `<tr><td colspan="6" style="text-align:center; padding: 15px; color: #94a3b8;">No payment history</td></tr>`;
    }
    
    const iconType = debt.icon_type || 'credit_card';
    let iconHtml = 'fa-credit-card';
    if(iconType === 'car') iconHtml = 'fa-car';
    else if(iconType === 'house') iconHtml = 'fa-house';
    else if(iconType === 'personal') iconHtml = 'fa-sack-dollar';
    else if(iconType === 'student') iconHtml = 'fa-graduation-cap';

    panel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
            <div>
                <h2 style="margin: 0; background: linear-gradient(90deg, #3b82f6, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: bold; font-size: 1.6rem; display: flex; align-items: center; gap: 8px;"><i class="fa-solid ${iconHtml}" style="color: #3b82f6; -webkit-text-fill-color: initial;"></i>${debt.name}</h2>
                <div style="color: #f472b6; margin-top: 5px; font-weight: 600; font-size: 1.0rem;"><i class="fa-solid fa-user"></i> ${contact ? contact.name : 'Unknown'}</div>
            </div>
            <!-- Removed Edit button -->
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; margin-bottom: 20px;">
            <div style="background: #ffffff; padding: 12px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <div style="font-size: 0.8rem; color: #64748b; margin-bottom: 4px; font-weight: 500;">Remaining Balance</div>
                <div id="summary-balance" style="font-size: 1.25rem; font-weight: 700; color: #3b82f6;">${formatCurrency(balance)}</div>
            </div>
            <div style="background: #ffffff; padding: 12px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <div style="font-size: 0.8rem; color: #64748b; margin-bottom: 4px; font-weight: 500;">Principal</div>
                <div id="summary-principal" style="font-size: 1.25rem; font-weight: 700; color: #10b981;">${formatCurrency(paidPrincipal)}</div>
            </div>
            <div style="background: #ffffff; padding: 12px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <div style="font-size: 0.8rem; color: #64748b; margin-bottom: 4px; font-weight: 500;">Interest</div>
                <div id="summary-interest" style="font-size: 1.25rem; font-weight: 700; color: #f59e0b;">${formatCurrency(paidInterest)}</div>
            </div>
            <div style="background: #ffffff; padding: 12px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <div style="font-size: 0.8rem; color: #64748b; margin-bottom: 4px; font-weight: 500;">Total Amount</div>
                <div id="summary-total" style="font-size: 1.25rem; font-weight: 700; color: #8b5cf6;">${formatCurrency(totalAmount)}</div>
            </div>
        </div>
        
        <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <h4 style="margin:0; font-weight: 700; font-size: 1.05rem; color: #ec4899;"><i class="fa-solid fa-clock-rotate-left"></i> PAYMENT HISTORY</h4>
                <select id="year-filter" data-debt-id="${debt.debt_id || debt.id}" onchange="filterDebtHistory()" style="padding: 4px 10px; border-radius: 6px; border: 1px solid #cbd5e1; background: #f8fafc; color: #0f172a; font-weight: 500; outline: none; cursor: pointer; font-size: 0.9rem;">
                    <option value="ALL">All Years</option>
                    ${yearOptions}
                </select>
            </div>
            <div style="background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                    <thead>
                        <tr style="background: #f8fafc; color: #475569; text-align: left; border-bottom: 2px solid #e2e8f0;">
                            <th style="padding: 8px 10px; width: 15%; font-weight: 600;">Date</th>
                            <th style="padding: 8px 10px; width: 30%; font-weight: 600;">Statement</th>
                            <th style="padding: 8px 10px; width: 15%; text-align: right; font-weight: 600;">Amount</th>
                            <th style="padding: 8px 10px; width: 15%; text-align: right; font-weight: 600;">Principal</th>
                            <th style="padding: 8px 10px; width: 15%; text-align: right; font-weight: 600;">Interest</th>
                            <th style="padding: 8px 10px; width: 10%; text-align: center; font-weight: 600;">Status</th>
                        </tr>
                    </thead>
                    <tbody id="debt-tx-tbody">
                        ${txRows}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}"""

app = pattern.sub(new_view_func, app)

with open(app_js_path, 'w') as f:
    f.write(app)

print("Done padding and icon")
