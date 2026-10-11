import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

# Replace renderDebtsDashboard completely
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
            const color = d.type === 'PAYABLE' ? '#ff4d6d' : '#2ec4b6';
            
            const card = document.createElement('div');
            // Neumorphism styling for sidebar items
            card.style.cssText = `
                padding: 15px; 
                border-radius: 15px; 
                background: linear-gradient(135deg, rgba(255,255,255,0.8), rgba(255,255,255,0.4)); 
                box-shadow: 4px 4px 10px rgba(255,181,167,0.3), -4px -4px 10px rgba(255,255,255,0.8);
                cursor: pointer;
                transition: transform 0.2s, box-shadow 0.2s;
                border: 1px solid rgba(255,255,255,0.6);
            `;
            card.onmouseover = () => { card.style.transform = 'translateY(-2px)'; card.style.boxShadow = '6px 6px 12px rgba(255,181,167,0.4), -6px -6px 12px rgba(255,255,255,0.9)'; };
            card.onmouseout = () => { card.style.transform = 'none'; card.style.boxShadow = '4px 4px 10px rgba(255,181,167,0.3), -4px -4px 10px rgba(255,255,255,0.8)'; };
            
            card.onclick = () => viewDebtDetails(d.id, currentBalance, principalPaid, interestPaid);
            
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                    <div>
                        <h4 style="margin: 0; color: #333; font-size: 1rem;">${d.name}</h4>
                        <small style="color: #666;"><i class="fa-solid fa-user" style="color: #ffb5a7;"></i> ${AppState.contacts.find(c => c.contact_id == d.contact_id)?.name || '-'}</small>
                    </div>
                </div>
                <div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span style="font-size: 0.8rem; color: #888;">ยอดคงเหลือ</span>
                        <span style="font-size: 1rem; font-weight: bold; color: ${color};">฿${formatCurrency(currentBalance)}</span>
                    </div>
                    <div style="background: rgba(255,255,255,0.5); height: 6px; border-radius: 3px; overflow: hidden; box-shadow: inset 1px 1px 3px rgba(0,0,0,0.1);">
                        <div style="width: ${progress}%; height: 100%; background: ${color}; border-radius: 3px;"></div>
                    </div>
                </div>
            `;
            container.appendChild(card);
        }
    });
}

function viewDebtDetails(debtId, currentBalance, principalPaid, interestPaid) {
    const d = AppState.debts.find(x => x.id === debtId);
    if(!d) return;

    document.getElementById('debt-empty-state').style.display = 'none';
    const detailsPanel = document.getElementById('debt-details-panel');
    detailsPanel.style.display = 'block';

    const color = d.type === 'PAYABLE' ? '#ff4d6d' : '#2ec4b6';
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
                const totalAmount = txPrincipal + txInterest; // Note: total amount paid might be different if other items exist, but we sum the debt parts
                historyHtml += `
                    <tr style="border-bottom: 1px solid rgba(255,181,167,0.2);">
                        <td style="padding: 12px 10px; color: #555;">${tx.date}</td>
                        <td style="padding: 12px 10px; font-weight: bold; color: #333;">฿${formatCurrency(totalAmount)}</td>
                        <td style="padding: 12px 10px; color: #666;">฿${formatCurrency(txPrincipal)}</td>
                        <td style="padding: 12px 10px; color: #666;">฿${formatCurrency(txInterest)}</td>
                        <td style="padding: 12px 10px;"><span style="background: rgba(46, 196, 182, 0.2); color: #2ec4b6; padding: 4px 8px; border-radius: 12px; font-size: 0.8rem; font-weight: bold;">สำเร็จ</span></td>
                    </tr>
                `;
            }
        });
    }

    if (!historyHtml) {
        historyHtml = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: #999;">ไม่มีประวัติการชำระเงิน</td></tr>`;
    }

    detailsPanel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 25px; padding-bottom: 20px; border-bottom: 2px dashed rgba(255,181,167,0.4);">
            <div>
                <h2 style="margin: 0; color: #333; text-shadow: 1px 1px 2px rgba(255,255,255,0.8);">${d.name}</h2>
                <div style="color: #666; margin-top: 5px; font-size: 1.1rem;"><i class="fa-solid fa-user" style="color: #ffb5a7;"></i> ${contactName}</div>
            </div>
            <div style="text-align: right;">
                <div style="font-size: 0.9rem; color: #888; margin-bottom: 5px;">ยอดคงเหลือปัจจุบัน</div>
                <div style="font-size: 2.2rem; font-weight: bold; color: ${color}; text-shadow: 1px 1px 3px rgba(0,0,0,0.1);">฿${formatCurrency(currentBalance)}</div>
            </div>
        </div>

        <div style="display: flex; gap: 20px; margin-bottom: 30px;">
            <div style="flex: 1; background: rgba(255,255,255,0.5); padding: 15px; border-radius: 15px; box-shadow: inset 2px 2px 5px rgba(0,0,0,0.05), inset -2px -2px 5px rgba(255,255,255,0.8);">
                <div style="font-size: 0.85rem; color: #888;">ยอดตั้งต้น</div>
                <div style="font-size: 1.2rem; font-weight: bold; color: #444;">฿${formatCurrency(d.start_balance)}</div>
            </div>
            <div style="flex: 1; background: rgba(255,255,255,0.5); padding: 15px; border-radius: 15px; box-shadow: inset 2px 2px 5px rgba(0,0,0,0.05), inset -2px -2px 5px rgba(255,255,255,0.8);">
                <div style="font-size: 0.85rem; color: #888;">จ่าย/รับแล้วรวม</div>
                <div style="font-size: 1.2rem; font-weight: bold; color: #444;">฿${formatCurrency(principalPaid)}</div>
            </div>
        </div>

        <h3 style="color: #ff758f; margin-bottom: 15px;"><i class="fa-solid fa-clock-rotate-left"></i> ประวัติการชำระเงิน</h3>
        <div style="background: rgba(255,255,255,0.6); border-radius: 15px; overflow: hidden; box-shadow: 4px 4px 10px rgba(0,0,0,0.05);">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
                <thead style="background: rgba(255,181,167,0.2);">
                    <tr>
                        <th style="padding: 12px 10px; color: #ff4d6d; font-weight: bold;">วันที่</th>
                        <th style="padding: 12px 10px; color: #ff4d6d; font-weight: bold;">จำนวนเงินรวม</th>
                        <th style="padding: 12px 10px; color: #ff4d6d; font-weight: bold;">ตัดเงินต้น</th>
                        <th style="padding: 12px 10px; color: #ff4d6d; font-weight: bold;">ตัดดอกเบี้ย</th>
                        <th style="padding: 12px 10px; color: #ff4d6d; font-weight: bold;">สถานะ</th>
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

print("Updated app.js successfully!")
