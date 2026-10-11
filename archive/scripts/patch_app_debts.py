import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

debts_logic = """
// ── DEBTS MANAGEMENT LOGIC ──

async function fetchDebts() {
    try {
        const res = await fetch(`${API_BASE}/api/debts`, { headers: { 'x-user-id': getUserId() } });
        if (res.ok) {
            AppState.debts = await res.json();
        }
    } catch (e) {
        console.error("Error fetching debts", e);
    }
}

async function renderDebtsSettings() {
    await fetchDebts();
    const tbody = document.getElementById("settings-debts-body");
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (!AppState.debts || AppState.debts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">ไม่มีข้อมูลโปรไฟล์หนี้สิน</td></tr>';
        return;
    }
    
    AppState.debts.forEach(d => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${d.name}</td>
            <td><span class="badge ${d.type === 'PAYABLE' ? 'bg-danger' : 'bg-success'}">${d.type === 'PAYABLE' ? 'หนี้ที่ต้องจ่าย' : 'เงินให้กู้ยืม'}</span></td>
            <td>${formatCurrency(d.start_balance)}</td>
            <td>${d.installment_amount ? formatCurrency(d.installment_amount) : '-'}</td>
            <td>
                <button class="btn btn-sm btn-outline" onclick="showDebtModal(${d.id})"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-sm btn-danger" onclick="deleteDebtProfile(${d.id})"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function showDebtModal(id = null) {
    document.getElementById('debt-modal').classList.remove('hidden');
    
    // Populate dropdowns
    const contactSel = document.getElementById('debt-contact-id');
    contactSel.innerHTML = '<option value="">-- ไม่ระบุ --</option>';
    AppState.contacts.forEach(c => {
        contactSel.innerHTML += `<option value="${c.contact_id}">${c.name}</option>`;
    });
    
    const prinSel = document.getElementById('debt-principal-cat');
    prinSel.innerHTML = '<option value="">-- ไม่ระบุ --</option>';
    const intSel = document.getElementById('debt-interest-cat');
    intSel.innerHTML = '<option value="">-- ไม่ระบุ --</option>';
    
    AppState.categories.forEach(c => {
        const opt = `<option value="${c.category_id}">${c.name}</option>`;
        prinSel.innerHTML += opt;
        intSel.innerHTML += opt;
    });

    if (id) {
        const d = AppState.debts.find(x => x.id === id);
        document.getElementById('debt-id').value = d.id;
        document.getElementById('debt-type').value = d.type;
        document.getElementById('debt-name').value = d.name;
        document.getElementById('debt-contact-id').value = d.contact_id || '';
        document.getElementById('debt-start-balance').value = d.start_balance;
        document.getElementById('debt-installment').value = d.installment_amount || '';
        document.getElementById('debt-start-date').value = d.start_date || '';
        document.getElementById('debt-principal-cat').value = d.principal_category_id || '';
        document.getElementById('debt-interest-cat').value = d.interest_category_id || '';
    } else {
        document.getElementById('debt-form').reset();
        document.getElementById('debt-id').value = '';
    }
}

function closeDebtModal() {
    document.getElementById('debt-modal').classList.add('hidden');
}

async function saveDebtProfile(e) {
    e.preventDefault();
    const id = document.getElementById('debt-id').value;
    const payload = {
        type: document.getElementById('debt-type').value,
        name: document.getElementById('debt-name').value,
        contact_id: document.getElementById('debt-contact-id').value || null,
        start_balance: document.getElementById('debt-start-balance').value,
        installment_amount: document.getElementById('debt-installment').value || null,
        start_date: document.getElementById('debt-start-date').value || null,
        principal_category_id: document.getElementById('debt-principal-cat').value || null,
        interest_category_id: document.getElementById('debt-interest-cat').value || null
    };

    try {
        const method = id ? 'PUT' : 'POST';
        const url = id ? `${API_BASE}/api/debts/${id}` : `${API_BASE}/api/debts`;
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', 'x-user-id': getUserId() },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            closeDebtModal();
            await renderDebtsSettings();
            alert("บันทึกสำเร็จ");
        } else {
            alert("เกิดข้อผิดพลาด");
        }
    } catch (err) {
        console.error(err);
        alert("Error saving debt");
    }
}

async function deleteDebtProfile(id) {
    if (!confirm("คุณต้องการลบโปรไฟล์หนี้นี้ใช่หรือไม่?")) return;
    try {
        const res = await fetch(`${API_BASE}/api/debts/${id}`, {
            method: 'DELETE',
            headers: { 'x-user-id': getUserId() }
        });
        if (res.ok) {
            await renderDebtsSettings();
        }
    } catch(e) {
        console.error(e);
    }
}

let currentDebtTab = 'PAYABLE';
function switchDebtTab(tab) {
    currentDebtTab = tab;
    document.querySelectorAll('.debts-dashboard .tabs button').forEach(btn => btn.classList.remove('active'));
    if(tab === 'PAYABLE') document.getElementById('tab-payable').classList.add('active');
    else document.getElementById('tab-receivable').classList.add('active');
    renderDebtsDashboard();
}

async function renderDebtsDashboard() {
    await fetchDebts();
    const container = document.getElementById("debts-cards-container");
    if (!container) return;
    container.innerHTML = '';
    
    // We assume AppState.transactions contains history. We need to calculate remaining balances.
    // For now we'll do a rough calculation using start_balance and any transactions linked to the principal_category_id.
    
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
                        // Matching on category + contact ensures it belongs to this debt
                        if (det.contact_id == d.contact_id) {
                            if (d.principal_category_id && det.caption_id == d.principal_category_id) {
                                // if payable, paying principal is an expense (reduces balance). If receiving principal, it's income (reduces receivable balance)
                                // But since values are absolute, we just sum up the paid principal.
                                principalPaid += Number(det.fee || 0);
                                currentBalance -= Number(det.fee || 0);
                            }
                            if (d.interest_category_id && det.caption_id == d.interest_category_id) {
                                interestPaid += Number(det.fee || 0);
                            }
                        }
                    });
                }
            });
        }
        
        // Prevent negative
        if(currentBalance < 0) currentBalance = 0;
        
        if (d.type === 'PAYABLE') totalPayable += currentBalance;
        if (d.type === 'RECEIVABLE') totalReceivable += currentBalance;
        
        if (d.type === currentDebtTab) {
            const progress = d.start_balance > 0 ? ((Number(d.start_balance) - currentBalance) / Number(d.start_balance)) * 100 : 0;
            const color = d.type === 'PAYABLE' ? 'var(--danger-color)' : 'var(--success-color)';
            
            const card = document.createElement('div');
            card.className = 'card glass';
            card.innerHTML = `
                <div class="card-body">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
                        <div>
                            <h4 style="margin: 0; color: var(--text-primary);">${d.name}</h4>
                            <small style="color: var(--text-secondary);"><i class="fa-solid fa-user"></i> ${AppState.contacts.find(c => c.contact_id == d.contact_id)?.name || '-'}</small>
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 15px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                            <span style="font-size: 0.9rem; color: var(--text-secondary);">ยอดคงเหลือ</span>
                            <span style="font-size: 1.1rem; font-weight: bold; color: ${color};">฿${formatCurrency(currentBalance)}</span>
                        </div>
                        <div style="background: #e2e8f0; height: 8px; border-radius: 4px; overflow: hidden;">
                            <div style="width: ${progress}%; height: 100%; background: ${color}; transition: width 0.3s;"></div>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-top: 5px; font-size: 0.8rem; color: var(--text-muted);">
                            <span>ยอดตั้งต้น: ฿${formatCurrency(d.start_balance)}</span>
                            <span>จ่าย/รับแล้ว: ฿${formatCurrency(principalPaid)}</span>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 10px; margin-top: 15px;">
                        <button class="btn btn-primary" style="flex: 1;" onclick="prefillDebtTransaction(${d.id})">
                            <i class="fa-solid fa-hand-holding-dollar"></i> ${d.type === 'PAYABLE' ? 'จ่ายค่างวด' : 'รับค่างวด'}
                        </button>
                    </div>
                </div>
            `;
            container.appendChild(card);
        }
    });
    
    document.getElementById('total-payable-balance').innerText = `฿${formatCurrency(totalPayable)}`;
    document.getElementById('total-receivable-balance').innerText = `฿${formatCurrency(totalReceivable)}`;
}

window.prefillDebtTransaction = function(debtId) {
    const d = AppState.debts.find(x => x.id === debtId);
    if(!d) return;
    
    // Setup Draft
    AppState.draftHistoryTx = {
        tx_id: null,
        date: new Date().toISOString().split('T')[0],
        total_amount: 0,
        account_name: '',
        details: []
    };
    
    // Push principal row
    if (d.principal_category_id) {
        AppState.draftHistoryTx.details.push({
            detail_id: 'new-' + Date.now() + 1,
            behavior: d.type === 'PAYABLE' ? 'EXPENSE' : 'INCOME',
            contact_id: d.contact_id,
            entity_id: null,
            caption_id: d.principal_category_id,
            fee: d.installment_amount ? d.installment_amount * 0.8 : 0, // Mock 80% principal
            wht: 0,
            vat: 0
        });
    }
    
    // Push interest row
    if (d.interest_category_id) {
        AppState.draftHistoryTx.details.push({
            detail_id: 'new-' + Date.now() + 2,
            behavior: d.type === 'PAYABLE' ? 'EXPENSE' : 'INCOME',
            contact_id: d.contact_id,
            entity_id: null,
            caption_id: d.interest_category_id,
            fee: d.installment_amount ? d.installment_amount * 0.2 : 0, // Mock 20% interest
            wht: 0,
            vat: 0
        });
    }
    
    // Calculate total
    AppState.draftHistoryTx.total_amount = AppState.draftHistoryTx.details.reduce((acc, curr) => acc + curr.fee, 0);
    
    // Open standard modal
    AppState.editingDetailIds.clear();
    AppState.draftHistoryTx.details.forEach(dx => AppState.editingDetailIds.add(dx.detail_id));
    openTxModal(); // Standard modal from app.js
};
"""

if "// ── DEBTS MANAGEMENT LOGIC ──" not in app:
    app += "\n\n" + debts_logic

# Fix loadDebtor hook
if "renderDebtsDashboard();" not in app:
    app = app.replace("async function loadDebtor() {", "async function loadDebtor() {\n    renderDebtsDashboard();\n    return;\n")

# Hook settings render
app = app.replace('if (activeSec) {', """if (activeSec) {
                if (targetTab === 'debts') renderDebtsSettings();""")

with open(app_js_path, 'w') as f:
    f.write(app)

print("App logic patched")
