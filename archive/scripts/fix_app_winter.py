import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

# Replace the card rendering logic and viewDebtDetails logic
new_render = """async function renderDebtsDashboard() {
    await fetchDebts();
    
    try {
        const res = await fetch(`${API_BASE}/api/transactions?status=CONFIRMED`, { headers: { 'x-user-id': encodeURIComponent(AppState.userId) } });
        if (res.ok) AppState.transactions = await res.json();
    } catch (e) { console.error(e); }

    const container = document.getElementById("debts-sidebar-list");
    if (!container) return;
    container.innerHTML = '';
    
    let totalPayable = 0;
    let totalReceivable = 0;
    
    AppState.debts.forEach(d => {
        let currentBalance = Number(d.start_balance);
        let principalPaid = 0;
        let interestPaid = 0;
        
        if (AppState.transactions) {
            AppState.transactions.forEach(tx => {
                if (tx.details) {
                    tx.details.forEach(det => {
                        if (det.contact_id == d.contact_id) {
                            if (d.principal_category_id && det.category_id == d.principal_category_id) {
                                principalPaid += Number(det.amount || 0);
                                currentBalance -= Number(det.amount || 0);
                            }
                            if (d.interest_category_id && det.category_id == d.interest_category_id) {
                                interestPaid += Number(det.amount || 0);
                            }
                        }
                    });
                }
            });
        }
        
        if(currentBalance < 0) currentBalance = 0;
        
        if (d.type === 'PAYABLE') totalPayable += currentBalance;
        if (d.type === 'RECEIVABLE') totalReceivable += currentBalance;
        
        if (d.type === currentDebtTab) {
            const progress = d.start_balance > 0 ? ((Number(d.start_balance) - currentBalance) / Number(d.start_balance)) * 100 : 0;
            
            // Assign pastel colors based on type or just randomly for visual
            let iconBg = '#a2d2ff'; // pastel blue default
            let iconColor = '#2c3e50';
            let iconClass = 'fa-solid fa-credit-card';
            
            if (d.name.includes('รถ') || d.name.toLowerCase().includes('car')) {
                iconBg = '#ffb5a7'; // pastel pink
                iconClass = 'fa-solid fa-car';
            } else if (d.name.includes('บ้าน') || d.name.toLowerCase().includes('house')) {
                iconBg = '#bde0fe'; // light blue
                iconClass = 'fa-solid fa-house';
            } else if (d.name.includes('ส่วนบุคคล') || d.name.toLowerCase().includes('personal')) {
                iconBg = '#ffd6a5'; // pastel orange
                iconClass = 'fa-solid fa-sack-dollar';
            } else if (d.name.includes('กยศ') || d.name.toLowerCase().includes('student')) {
                iconBg = '#caffbf'; // pastel green
                iconClass = 'fa-solid fa-graduation-cap';
            }

            const card = document.createElement('div');
            // Neumorphism styling for sidebar items
            card.style.cssText = `
                padding: 12px; 
                border-radius: 15px; 
                background: linear-gradient(135deg, rgba(255,255,255,0.9), rgba(255,255,255,0.6)); 
                box-shadow: 4px 4px 10px rgba(162, 210, 255, 0.2), -4px -4px 10px rgba(255,255,255,0.8);
                cursor: pointer;
                transition: transform 0.2s, box-shadow 0.2s;
                border: 1px solid rgba(255,255,255,0.8);
                display: flex;
                align-items: center;
                gap: 12px;
            `;
            card.onmouseover = () => { card.style.transform = 'translateY(-2px)'; card.style.boxShadow = '6px 6px 12px rgba(162, 210, 255, 0.3), -6px -6px 12px rgba(255,255,255,0.9)'; };
            card.onmouseout = () => { card.style.transform = 'none'; card.style.boxShadow = '4px 4px 10px rgba(162, 210, 255, 0.2), -4px -4px 10px rgba(255,255,255,0.8)'; };
            
            card.onclick = () => viewDebtDetails(d.id, currentBalance, principalPaid, interestPaid);
            
            card.innerHTML = `
                <div style="width: 45px; height: 45px; border-radius: 12px; background: ${iconBg}; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; color: ${iconColor}; box-shadow: inset 2px 2px 5px rgba(255,255,255,0.5), inset -2px -2px 5px rgba(0,0,0,0.05); flex-shrink: 0;">
                    <i class="${iconClass}"></i>
                </div>
                <div style="flex: 1;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                        <h4 style="margin: 0; color: #2c3e50; font-size: 0.95rem;">${d.name}</h4>
                        <span style="font-size: 0.95rem; font-weight: bold; color: #3d5a80;">฿${formatCurrency(currentBalance)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <small style="color: #888; font-size: 0.75rem;">${AppState.contacts.find(c => c.contact_id == d.contact_id)?.name || '-'}</small>
                        <span style="font-size: 0.7rem; color: #2ec4b6;"><i class="fa-solid fa-check"></i> Status</span>
                    </div>
                </div>
            `;
            container.appendChild(card);
        }
    });

    // Update Summary Pie Chart dynamically if needed (Optional)
    const pieEl = document.getElementById('debt-summary-chart');
    if (pieEl && (totalPayable > 0 || totalReceivable > 0)) {
        // Just mock updating it based on actual values if you want, or leave it as static visual representation for now.
    }
}

function viewDebtDetails(debtId, currentBalance, principalPaid, interestPaid) {
    const d = AppState.debts.find(x => x.id === debtId);
    if(!d) return;

    document.getElementById('debt-empty-state').style.display = 'none';
    const detailsPanel = document.getElementById('debt-details-panel');
    detailsPanel.style.display = 'block';

    const color = '#3d5a80';
    const contactName = AppState.contacts.find(c => c.contact_id == d.contact_id)?.name || '-';

    // Find history transactions for this debt
    let historyHtml = '';
    if (AppState.transactions) {
        // Sort by date descending
        const sortedTx = [...AppState.transactions].sort((a,b) => new Date(b.date) - new Date(a.date));
        
        sortedTx.forEach(tx => {
            let txPrincipal = 0;
            let txInterest = 0;
            let involved = false;
            
            if (tx.details) {
                tx.details.forEach(det => {
                    if (det.contact_id == d.contact_id) {
                        if (d.principal_category_id && det.category_id == d.principal_category_id) {
                            txPrincipal += Number(det.amount || 0);
                            involved = true;
                        }
                        if (d.interest_category_id && det.category_id == d.interest_category_id) {
                            txInterest += Number(det.amount || 0);
                            involved = true;
                        }
                    }
                });
            }
            
            if (involved) {
                const totalAmount = txPrincipal + txInterest; 
                historyHtml += `
                    <tr style="border-bottom: 1px dashed rgba(162, 210, 255, 0.3);">
                        <td style="padding: 10px; color: #555; font-size: 0.9rem;">${tx.date}</td>
                        <td style="padding: 10px; font-weight: bold; color: #2c3e50; font-size: 0.95rem;">฿${formatCurrency(totalAmount)}</td>
                        <td style="padding: 10px; color: #666; font-size: 0.9rem;">฿${formatCurrency(txPrincipal)}</td>
                        <td style="padding: 10px; color: #666; font-size: 0.9rem;">฿${formatCurrency(txInterest)}</td>
                        <td style="padding: 10px;"><span style="color: #2ec4b6; font-size: 1rem;"><i class="fa-solid fa-circle-check"></i></span></td>
                    </tr>
                `;
            }
        });
    }

    if (!historyHtml) {
        historyHtml = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: #999;">ไม่มีประวัติการชำระเงิน</td></tr>`;
    }

    detailsPanel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid rgba(162, 210, 255, 0.4);">
            <div>
                <h2 style="margin: 0; color: #2c3e50; font-size: 1.4rem; text-shadow: 1px 1px 2px rgba(255,255,255,0.8);">${d.name}</h2>
                <div style="color: #7f8c8d; margin-top: 5px; font-size: 1rem;"><i class="fa-solid fa-user" style="color: #a2d2ff;"></i> ${contactName}</div>
            </div>
            <div style="display:flex; gap: 10px;">
                <button class="btn btn-outline" style="border-radius: 10px; padding: 5px 15px; font-size: 0.8rem; background: rgba(255,255,255,0.5); color: #3d5a80; border:1px solid #a2d2ff;">Filters <i class="fa-solid fa-chevron-down"></i></button>
            </div>
        </div>

        <div style="display: flex; gap: 15px; margin-bottom: 20px;">
            <div style="flex: 1; background: linear-gradient(135deg, rgba(255,255,255,0.8), rgba(255,255,255,0.4)); padding: 15px; border-radius: 15px; box-shadow: inset 2px 2px 5px rgba(255,255,255,0.8), inset -2px -2px 5px rgba(0,0,0,0.05); border: 1px solid rgba(255,255,255,0.6);">
                <div style="font-size: 0.8rem; color: #7f8c8d; margin-bottom: 5px;">ยอดคงเหลือปัจจุบัน</div>
                <div style="font-size: 1.6rem; font-weight: bold; color: ${color}; text-shadow: 1px 1px 2px rgba(255,255,255,1);">฿${formatCurrency(currentBalance)}</div>
            </div>
            <div style="flex: 1; background: linear-gradient(135deg, rgba(255,255,255,0.8), rgba(255,255,255,0.4)); padding: 15px; border-radius: 15px; box-shadow: inset 2px 2px 5px rgba(255,255,255,0.8), inset -2px -2px 5px rgba(0,0,0,0.05); border: 1px solid rgba(255,255,255,0.6);">
                <div style="font-size: 0.8rem; color: #7f8c8d; margin-bottom: 5px;">จ่าย/รับแล้วรวม</div>
                <div style="font-size: 1.6rem; font-weight: bold; color: #333;">฿${formatCurrency(principalPaid)}</div>
            </div>
        </div>

        <h3 style="color: #3d5a80; margin-bottom: 10px; font-size: 1.1rem;"><i class="fa-solid fa-clock-rotate-left"></i> PAYMENT HISTORY</h3>
        <div style="background: rgba(255,255,255,0.7); border-radius: 15px; overflow: hidden; box-shadow: 4px 4px 10px rgba(162, 210, 255, 0.1), -4px -4px 10px rgba(255,255,255,0.8); border: 1px solid rgba(255,255,255,0.6);">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
                <thead style="background: rgba(162, 210, 255, 0.2); border-bottom: 2px solid rgba(162, 210, 255, 0.4);">
                    <tr>
                        <th style="padding: 10px; color: #3d5a80; font-weight: bold; font-size: 0.85rem;">Date</th>
                        <th style="padding: 10px; color: #3d5a80; font-weight: bold; font-size: 0.85rem;">Amount</th>
                        <th style="padding: 10px; color: #3d5a80; font-weight: bold; font-size: 0.85rem;">Principal</th>
                        <th style="padding: 10px; color: #3d5a80; font-weight: bold; font-size: 0.85rem;">Interest</th>
                        <th style="padding: 10px; color: #3d5a80; font-weight: bold; font-size: 0.85rem;">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${historyHtml}
                </tbody>
            </table>
        </div>
    `;
}
"""

app = re.sub(r'async function renderDebtsDashboard\(\) \{[\s\S]*?(?=window\.prefillDebtTransaction)', new_render + '\n\n', app)

with open(app_js_path, 'w') as f:
    f.write(app)

print("Updated app.js successfully for Winter Theme!")
