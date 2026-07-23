import re

file_path = "frontend/app.js"
with open(file_path, 'r') as f:
    content = f.read()

# Add AppState.debts
if "debts: []," not in content:
    content = content.replace("categories: [],", "categories: [],\n    debts: [],")

# Add fetchDebts to fetchMasterData
if "AppState.debts = await apiCall('/debts');" not in content:
    content = content.replace("AppState.categories = await apiCall('/categories');", "AppState.categories = await apiCall('/categories');\n        AppState.debts = await apiCall('/debts');")

# Remove old renderDebtors logic and replace with new Debts logic
debts_js = """
// -------------------- Debt Management Module -------------------- //
let currentDebtTab = 'PAYABLE';

function switchDebtTab(tab) {
    currentDebtTab = tab;
    document.getElementById('tab-payable').classList.toggle('active', tab === 'PAYABLE');
    document.getElementById('tab-receivable').classList.toggle('active', tab === 'RECEIVABLE');
    renderDebtsDashboard();
}

function renderDebtsDashboard() {
    if (!AppState.debts) return;
    
    // Filter by tab
    const filteredDebts = AppState.debts.filter(d => d.type === currentDebtTab);
    
    const container = document.getElementById('debts-cards-container');
    container.innerHTML = '';
    
    let totalBalance = 0;
    
    // Calculate balances for each debt based on transactions
    filteredDebts.forEach(debt => {
        // Find all transaction details matching this debt's contact and principal category
        const relatedTxDetails = AppState.history.flatMap(tx => tx.details).filter(det => 
            det.contact_id === debt.contact_id && det.category_id === debt.principal_category_id
        );
        
        // Sum principal paid (For PAYABLE, DEBIT_AR/EXPENSE/LIABILITY reduction is positive paid? 
        // Actually, let's just sum absolute values for simplicity or based on behavior.
        // Assuming user enters payment as Expense/Liability with positive amount in standard view.
        // Or wait, in this system: Liability payment is usually entered. 
        // Let's just sum the 'amount' field. If it's a payment to Liability, amount might be negative or positive depending on side.
        // Let's assume absolute amount of transactions against this category/contact is the "Paid" amount.
        
        let principalPaid = 0;
        relatedTxDetails.forEach(det => {
            // For PAYABLE (Liability), paying debt means decreasing it. 
            // Depending on how they record, we just sum up all transaction amounts for this category.
            // If it's just tracking paid amount, we sum absolute amounts.
            principalPaid += Math.abs(det.amount);
        });
        
        const currentBalance = debt.start_balance - principalPaid;
        totalBalance += currentBalance;
        
        const progressPercent = debt.start_balance > 0 ? Math.min(100, Math.round((principalPaid / debt.start_balance) * 100)) : 0;
        
        const card = document.createElement('div');
        card.className = 'card glass';
        card.style.padding = '20px';
        
        const contactName = AppState.contacts.find(c => c.contact_id === debt.contact_id)?.name || 'Unknown';
        
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
                <div>
                    <h4 style="margin: 0; color: var(--primary-dark);">${debt.name}</h4>
                    <small style="color: var(--text-secondary);"><i class="fa-solid fa-building-columns"></i> ${contactName}</small>
                </div>
                <div class="dropdown">
                    <button class="btn btn-sm btn-icon" onclick="editDebt('${debt.debt_id}')"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-sm btn-icon" onclick="deleteDebt('${debt.debt_id}')"><i class="fa-solid fa-trash" style="color:var(--danger-color)"></i></button>
                </div>
            </div>
            
            <div style="margin-bottom: 15px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 0.9rem;">
                    <span>ยอดคงเหลือ</span>
                    <span style="font-weight: bold; color: ${currentDebtTab==='PAYABLE' ? 'var(--danger-color)' : 'var(--success-color)'}">฿${formatNumber(currentBalance)}</span>
                </div>
                <div style="width: 100%; background: #eee; border-radius: 10px; height: 10px; overflow: hidden;">
                    <div style="width: ${progressPercent}%; height: 100%; background: var(--primary-color); border-radius: 10px;"></div>
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 5px; font-size: 0.8rem; color: #666;">
                    <span>จ่ายแล้ว ${progressPercent}%</span>
                    <span>จากตั้งต้น ฿${formatNumber(debt.start_balance)}</span>
                </div>
            </div>
            
            <button class="btn btn-primary" style="width: 100%;" onclick="payInstallment('${debt.debt_id}')">
                <i class="fa-solid fa-money-bill-wave"></i> บันทึกค่างวด
            </button>
        `;
        container.appendChild(card);
    });
    
    // Update Totals
    if (currentDebtTab === 'PAYABLE') {
        document.getElementById('total-payable-balance').textContent = `฿${formatNumber(totalBalance)}`;
    } else {
        document.getElementById('total-receivable-balance').textContent = `฿${formatNumber(totalBalance)}`;
    }
}

function showDebtModal() {
    document.getElementById('debt-form').reset();
    document.getElementById('debt-id').value = '';
    document.getElementById('debt-modal-title').textContent = 'สร้างโปรไฟล์หนี้ใหม่';
    
    // Populate Selects
    populateSelect('debt-contact', AppState.contacts, 'contact_id', 'name');
    populateSelect('debt-principal-category', AppState.categories, 'category_id', 'name');
    populateSelect('debt-interest-category', AppState.categories, 'category_id', 'name', true); // allow empty
    
    document.getElementById('debt-modal').style.display = 'flex';
}

function closeDebtModal() {
    document.getElementById('debt-modal').style.display = 'none';
}

function populateSelect(elementId, items, valueField, textField, allowEmpty = false) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.innerHTML = '';
    if (allowEmpty) {
        el.innerHTML = '<option value="">-- ไม่ระบุ --</option>';
    }
    items.forEach(item => {
        const option = document.createElement('option');
        option.value = item[valueField];
        option.textContent = item[textField] + (item.caption_name ? ` (${item.caption_name})` : '');
        el.appendChild(option);
    });
}

document.getElementById('debt-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        debt_id: document.getElementById('debt-id').value,
        type: document.getElementById('debt-type').value,
        name: document.getElementById('debt-name').value,
        contact_id: document.getElementById('debt-contact').value,
        start_balance: parseFloat(document.getElementById('debt-start-balance').value),
        installment_amount: parseFloat(document.getElementById('debt-installment').value) || 0,
        start_date: document.getElementById('debt-start-date').value,
        principal_category_id: document.getElementById('debt-principal-category').value,
        interest_category_id: document.getElementById('debt-interest-category').value || null
    };
    
    try {
        await apiCall('/debts', 'POST', data);
        closeDebtModal();
        await fetchMasterData(); // Refresh to get new debts
        renderDebtsDashboard();
        showToast('บันทึกข้อมูลสำเร็จ', 'success');
    } catch (err) {
        showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
    }
});

function editDebt(debtId) {
    const debt = AppState.debts.find(d => d.debt_id === debtId);
    if (!debt) return;
    showDebtModal();
    document.getElementById('debt-modal-title').textContent = 'แก้ไขโปรไฟล์หนี้';
    document.getElementById('debt-id').value = debt.debt_id;
    document.getElementById('debt-type').value = debt.type;
    document.getElementById('debt-name').value = debt.name;
    document.getElementById('debt-contact').value = debt.contact_id;
    document.getElementById('debt-start-balance').value = debt.start_balance;
    document.getElementById('debt-installment').value = debt.installment_amount || '';
    document.getElementById('debt-start-date').value = debt.start_date || '';
    document.getElementById('debt-principal-category').value = debt.principal_category_id;
    document.getElementById('debt-interest-category').value = debt.interest_category_id || '';
}

async function deleteDebt(debtId) {
    if (!confirm('คุณต้องการลบโปรไฟล์หนี้นี้ใช่หรือไม่? (ประวัติธุรกรรมเดิมจะไม่ถูกลบ)')) return;
    try {
        await apiCall('/debts/delete', 'POST', { debt_id: debtId });
        await fetchMasterData();
        renderDebtsDashboard();
        showToast('ลบข้อมูลสำเร็จ', 'success');
    } catch (err) {
        showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
    }
}

function payInstallment(debtId) {
    const debt = AppState.debts.find(d => d.debt_id === debtId);
    if (!debt) return;
    
    // Switch to Dashboard view and open Add Transaction Modal
    switchView('dashboard');
    showRecordModal();
    
    // Set split mode
    isSplitMode = true;
    updateSplitUI();
    
    // Ensure we have at least 2 rows for Principal and Interest if Interest is defined
    if (debt.interest_category_id && splitRows.length < 2) {
        addSplitRow();
    }
    
    // Pre-fill Principal row
    splitRows[0].categoryId = debt.principal_category_id;
    splitRows[0].contactId = debt.contact_id;
    splitRows[0].amount = debt.installment_amount > 0 ? debt.installment_amount : 0;
    
    // Pre-fill Interest row if exists
    if (debt.interest_category_id && splitRows.length > 1) {
        splitRows[1].categoryId = debt.interest_category_id;
        splitRows[1].contactId = debt.contact_id;
        splitRows[1].amount = 0; // User inputs interest
    }
    
    renderSplitRows();
    
    // If we have an installment amount, set the total amount
    if (debt.installment_amount) {
        document.getElementById('record-amount').value = debt.installment_amount;
    }
}
// ---------------------------------------------------------------- //
"""

if "function renderDebtsDashboard" not in content:
    content = content.replace("function renderDebtors() {", debts_js + "\n\nfunction renderDebtors() {")

# Also call renderDebtsDashboard inside switchView for 'debtor'
if "renderDebtsDashboard();" not in content:
    content = content.replace("if (viewId === 'debtor') renderDebtors();", "if (viewId === 'debtor') { renderDebtors(); renderDebtsDashboard(); }")

with open(file_path, 'w') as f:
    f.write(content)
print("Patched App JS")
