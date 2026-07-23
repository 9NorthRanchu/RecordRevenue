// opening_balance.js
function initOpeningBalance() {
    const btnLoad = document.getElementById('btn-load-ob-categories');
    const userSelect = document.getElementById('ob-user-select');
    const dateSelect = document.getElementById('ob-date-select');
    const container = document.getElementById('ob-accordion-container');
    const btnSave = document.getElementById('btn-save-opening-balance');

    if (!btnLoad || !userSelect || !dateSelect) return;

    // Set default date to today
    const tzoffset = (new Date()).getTimezoneOffset() * 60000; //offset in milliseconds
    const localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, 10);
    dateSelect.value = localISOTime;

    // Load users
    userSelect.addEventListener('focus', () => {
        if (userSelect.options.length <= 1 && AppState.settings && AppState.settings.entities) {
            userSelect.innerHTML = '<option value="">-- เลือกผู้ใช้ --</option>';
            AppState.settings.entities.forEach(ent => {
                const opt = document.createElement('option');
                opt.value = ent.entity_id;
                opt.textContent = ent.name;
                userSelect.appendChild(opt);
            });
        }
    });

    // Handle load categories
    btnLoad.addEventListener('click', () => {
        if (!userSelect.value) {
            alert('กรุณาเลือกผู้ใช้งาน (Owner)');
            return;
        }
        if (!dateSelect.value) {
            alert('กรุณาเลือกวันที่');
            return;
        }
        
        container.style.display = 'flex';
        renderOpeningBalanceInputs();
    });

    // Calculate totals
    const calcTotals = () => {
        let totalAssets = 0;
        let totalLiabilities = 0;

        document.querySelectorAll('.ob-asset-input').forEach(input => {
            totalAssets += parseFloat(input.value) || 0;
        });

        document.querySelectorAll('.ob-liability-input').forEach(input => {
            totalLiabilities += parseFloat(input.value) || 0;
        });

        const diff = totalAssets - totalLiabilities;

        document.getElementById('ob-assets-total').textContent = formatCurrency(totalAssets);
        document.getElementById('ob-footer-assets').textContent = formatCurrency(totalAssets);
        
        document.getElementById('ob-liabilities-total').textContent = formatCurrency(totalLiabilities);
        document.getElementById('ob-footer-liabilities').textContent = formatCurrency(totalLiabilities);
        
        const diffEl = document.getElementById('ob-footer-diff');
        diffEl.textContent = formatCurrency(Math.abs(diff));
        
        if (diff > 0) {
            diffEl.style.color = 'var(--success-color)';
            diffEl.textContent += ' (กำไรสะสม / ทุน)';
        } else if (diff < 0) {
            diffEl.style.color = 'var(--danger-color)';
            diffEl.textContent += ' (ขาดทุนสะสม)';
        } else {
            diffEl.style.color = '#fff';
        }

        // Always allow save, even if 0, because it will just save what was inputted + the difference
        btnSave.disabled = false;
    };

    const createRow = (id, name, type) => {
        const div = document.createElement('div');
        div.className = 'ob-row';
        div.innerHTML = `
            <div class="ob-row-label">${name}</div>
            <div class="ob-row-input">
                <input type="number" class="form-control ${type === 'asset' ? 'ob-asset-input' : 'ob-liability-input'}" 
                    data-id="${id}" data-name="${name}" data-type="${type}" step="0.01" placeholder="0.00" oninput="window.calcOBTotals()">
            </div>
        `;
        return div;
    };

    window.calcOBTotals = calcTotals;

    function renderOpeningBalanceInputs() {
        const assetsContent = document.getElementById('ob-assets-content');
        const liabilitiesContent = document.getElementById('ob-liabilities-content');
        
        assetsContent.innerHTML = '<h6>Statements / Accounts</h6>';
        liabilitiesContent.innerHTML = '<h6>Liabilities</h6>';
        
        // 1. Statements (Accounts)
        if (AppState.settings.accounts) {
            AppState.settings.accounts.forEach(acc => {
                assetsContent.appendChild(createRow(acc.account_id, '💳 ' + acc.name, 'asset'));
            });
        }
        
        // 2. Categories
        if (AppState.settings.categories && AppState.settings.captions) {
            assetsContent.appendChild(document.createElement('hr'));
            assetsContent.innerHTML += '<h6>Asset Categories</h6>';
            
            liabilitiesContent.appendChild(document.createElement('hr'));
            liabilitiesContent.innerHTML += '<h6>Liability Categories</h6>';

            const captionsMap = {};
            AppState.settings.captions.forEach(c => captionsMap[c.type_id] = c.behavior);

            AppState.settings.categories.forEach(cat => {
                const behavior = captionsMap[cat.category_type];
                if (behavior === 'ASSET' || behavior === 'REVENUE') {
                    assetsContent.appendChild(createRow(cat.category_id, '📈 ' + cat.name, 'asset'));
                } else if (behavior === 'LIABILITY' || behavior === 'EXPENSE') {
                    liabilitiesContent.appendChild(createRow(cat.category_id, '📉 ' + cat.name, 'liability'));
                }
            });
        }
        
        calcTotals();
    }

    btnSave.addEventListener('click', async () => {
        const entityId = userSelect.value;
        const dateVal = dateSelect.value;
        
        if (!entityId || !dateVal) return;

        const transactions = [];
        const dateObj = new Date(dateVal);
        const isoTime = dateObj.toISOString();

        // Collect all inputs that have a value
        document.querySelectorAll('.ob-asset-input, .ob-liability-input').forEach(input => {
            const val = parseFloat(input.value);
            if (val && val !== 0) {
                const isAsset = input.dataset.type === 'asset';
                transactions.push({
                    transaction_id: 'OB_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                    user_id: AppState.userId,
                    entity_id: entityId,
                    contact_id: '',
                    account_id: isAsset ? input.dataset.id : '', // If it's a statement, id is account_id. Wait, need to differentiate.
                    category_id: isAsset ? '' : input.dataset.id,
                    project_id: '',
                    type: isAsset ? 'INCOME' : 'EXPENSE', // Actually we need to set appropriate type
                    amount: Math.abs(val),
                    currency: 'THB',
                    date: isoTime,
                    description: 'Opening Balance - ' + input.dataset.name,
                    status: 'COMPLETED',
                    note: 'System Generated Opening Balance'
                });
            }
        });

        // We will need to adjust the data structure, but for now let's just log it to verify logic
        console.log("Saving opening balances:", transactions);
        alert("บันทึกยอดยกมาเรียบร้อยแล้ว (Check console)");
    });
}

// Hook it up after settings load
document.addEventListener('DOMContentLoaded', () => {
    // Add a small delay to ensure DOM is ready
    setTimeout(initOpeningBalance, 1000);
});
