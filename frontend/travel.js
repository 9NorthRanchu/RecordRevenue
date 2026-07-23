// travel.js - Logic for Poop Pup Tour (Trip Wallet System)

function getTravelApiBase() {
    return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:8787' 
        : 'https://record-revenue.9nimz.workers.dev';
}

function getUserIdHeader() {
    if (typeof AppState !== 'undefined' && AppState.userId) return AppState.userId;
    return localStorage.getItem('current_user_id') || 'Usr_A';
}

// deleteTrip moved to app.js

// -------------------------
// NEW TRIP MODAL
// -------------------------

async function submitGuestLogin() {
    const pwd = document.getElementById('login-trip-password').value;
    const errDiv = document.getElementById('guest-login-error');
    errDiv.classList.add('hidden');
    
    if(!pwd) {
        errDiv.innerText = 'กรุณากรอกรหัสผ่านทริป';
        errDiv.classList.remove('hidden');
        return;
    }

    try {
        const res = await fetch(getTravelApiBase() + '/api/trips/guest-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trip_password: pwd })
        });
        const result = await res.json();
        
        if(result.success && result.project_id) {
            window.location.href = 'guest.html?id=' + result.project_id;
        } else {
            errDiv.innerText = 'รหัสผ่านทริปไม่ถูกต้อง';
            errDiv.classList.remove('hidden');
        }
    } catch(e) {
        errDiv.innerText = 'เกิดข้อผิดพลาดในการเชื่อมต่อ';
        errDiv.classList.remove('hidden');
    }
}



// loadTrips removed - managed by app.js

// ---- Image store for theme selector ----
const THEME_BANNERS = [
    { key: 'banner_japan.jpg',  label: 'Japan 🌸' },
    { key: 'banner_beach.jpg',  label: 'Beach 🏖️' },
    { key: 'banner_europe.jpg', label: 'Europe 🗼' },
    { key: 'banner_beijing.jpg', label: 'Beijing 🐉' },
    { key: 'banner_hokkaido.jpg', label: 'Hokkaido ⛄️' },
    { key: 'banner_kushiro.jpg', label: 'Kushiro 🌅' },
    { key: 'banner_shanghai.jpg', label: 'Shanghai 🏙️' },
    { key: 'banner_okinawa.jpg', label: 'Okinawa 🏝️' },
    { key: 'banner_nagoya.jpg', label: 'Nagoya 🏯' }
];
const THEME_THUMBS = [
    { key: 'thumb_girl.jpg', label: 'Girl 👧' },
    { key: 'thumb_boy.jpg',  label: 'Boy 👦' },
    { key: 'thumb_fam1.jpg', label: 'Family 👨‍👩‍👧' },
    { key: 'thumb_fam2.jpg', label: 'Group 👩‍👩‍👦' },
    { key: 'thumb_fam3.jpg', label: 'Extended 👩‍👩‍👦‍👦' },
    { key: 'thumb_fam4.jpg', label: 'Big Fam 👩‍👩‍👦‍👦' },
    { key: 'thumb_fam5.jpg', label: 'Tourists 🎒' },
    { key: 'thumb_fam6.jpg', label: 'Tourists 📸' }
];
const THEME_ICONS = [
    { key: 'cloud_smile_1.jpg', label: 'Cloud ☁️' },
    { key: 'cloud_smile_2.jpg', label: 'Rainbow 🌈' },
    { key: 'cloud_smile_3.jpg', label: 'Moon 🌙' },
    { key: 'icon_japan_1.jpg', label: 'Japan Mascot 🍣' },
    { key: 'icon_hokkaido_1.jpg', label: 'Hokkaido Mascot ❄️' },
    { key: 'icon_tokyo_1.jpg', label: 'Tokyo Mascot 🗼' },
    { key: 'icon_shanghai_1.jpg', label: 'Shanghai Mascot 🥟' },
    { key: 'icon_nagoya_1.jpg', label: 'Nagoya Mascot 🍤' }
];

let _themeSelectProjectId = null;
let _themeSelectBanner = null;
let _themeSelectThumb  = null;
let _themeSelectIcon   = null;

function openThemeSelector(projectId, currentBanner, currentThumb, currentIcon) {
    _themeSelectProjectId = projectId;
    _themeSelectBanner = currentBanner || 'banner_japan.jpg';
    _themeSelectThumb  = currentThumb  || 'thumb_girl.jpg';
    _themeSelectIcon   = currentIcon   || 'cloud_smile_1.jpg';

    const overlay = document.createElement('div');
    overlay.className = 'theme-modal-overlay';
    overlay.id = 'theme-modal-overlay';
    overlay.innerHTML = `
    <div class="theme-modal">
        <h2>🎨 เลือกธีมทริป</h2>

        <div class="theme-section-label">🖼️ Banner Image (หน้าปกแนวนอน)</div>
        <div class="theme-image-grid" id="theme-banner-grid">
            ${THEME_BANNERS.map(b => `
                <img src="assets/images/${b.key}" class="theme-image-option ${_themeSelectBanner===b.key?'selected':''}" 
                     onclick="_themeSelectBanner='${b.key}'; document.querySelectorAll('#theme-banner-grid .theme-image-option').forEach(x=>x.classList.remove('selected')); this.classList.add('selected');" 
                     title="${b.label}">
            `).join('')}
        </div>

        <div class="theme-section-label">👤 Thumbnail Image (รูปโปรไฟล์)</div>
        <div class="theme-image-grid" id="theme-thumb-grid">
            ${THEME_THUMBS.map(b => `
                <img src="assets/images/${b.key}" class="theme-image-option square ${_themeSelectThumb===b.key?'selected':''}" 
                     onclick="_themeSelectThumb='${b.key}'; document.querySelectorAll('#theme-thumb-grid .theme-image-option').forEach(x=>x.classList.remove('selected')); this.classList.add('selected');" 
                     title="${b.label}">
            `).join('')}
        </div>

        <div class="theme-section-label">☁️ Icon Image (ก้อนเมฆ/ไอคอน)</div>
        <div class="theme-image-grid" id="theme-icon-grid">
            ${THEME_ICONS.map(b => `
                <img src="assets/images/${b.key}" class="theme-image-option square ${_themeSelectIcon===b.key?'selected':''}" 
                     onclick="_themeSelectIcon='${b.key}'; document.querySelectorAll('#theme-icon-grid .theme-image-option').forEach(x=>x.classList.remove('selected')); this.classList.add('selected');" 
                     title="${b.label}">
            `).join('')}
        </div>

        <div class="theme-modal-buttons">
            <button class="theme-btn-cancel" onclick="document.getElementById('theme-modal-overlay').remove()">ยกเลิก</button>
            <button class="theme-btn-save" onclick="saveTheme()">💾 บันทึกธีม</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);
}

async function saveTheme() {
    try {
        await fetch(`${getTravelApiBase()}/api/trips/theme`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-user-id': getUserIdHeader() },
            body: JSON.stringify({
                project_id: _themeSelectProjectId,
                theme_banner: _themeSelectBanner,
                theme_thumb:  _themeSelectThumb,
                theme_icon:   _themeSelectIcon
            })
        });
        document.getElementById('theme-modal-overlay').remove();
        loadTrips();
    } catch(e) {
        alert('บันทึกไม่สำเร็จ');
    }
}

// Palette of card border/header colors
const CARD_PALETTES = [
    { border: '#fda4af', header: '#fb7185', headerText: '#fff', shadow: 'rgba(251,113,133,0.3)' }, // Rose
    { border: '#93c5fd', header: '#60a5fa', headerText: '#fff', shadow: 'rgba(96,165,250,0.3)' },  // Blue
    { border: '#6ee7b7', header: '#34d399', headerText: '#fff', shadow: 'rgba(52,211,153,0.3)' },  // Mint
    { border: '#fcd34d', header: '#fbbf24', headerText: '#fff', shadow: 'rgba(251,191,36,0.3)' },  // Yellow
    { border: '#c4b5fd', header: '#a78bfa', headerText: '#fff', shadow: 'rgba(167,139,250,0.3)' }, // Purple
];

// endTrip removed

// buildTripCard and renderTrips removed - managed by app.js


// -------------------------
// TRIP DETAILS (TABS: OVERVIEW, ITINERARY, EXPENSES, DOCUMENTS)
// -------------------------
let currentTrip = null;
let currentTripExpenses = [];
let currentTripBudgets = [];
let currentTripStops = [];
let currentTripDocs = [];

async function openTripDetailOld(projectId) {
    try {
        const res = await fetch(getTravelApiBase() + '/api/trips', { headers: { 'x-user-id': getUserIdHeader() }});
        const trips = await res.json();
        currentTrip = trips.find(t => t.project_id === projectId);
        
        if(!currentTrip) return;

        // Fetch all related data
        const [expRes, budgRes, stopRes, docRes] = await Promise.all([
            fetch(getTravelApiBase() + '/api/trip-expenses?projectId=' + projectId, { headers: { 'x-user-id': getUserIdHeader() }}),
            fetch(getTravelApiBase() + '/api/trips/budgets?projectId=' + projectId, { headers: { 'x-user-id': getUserIdHeader() }}),
            fetch(getTravelApiBase() + '/api/trips/stops?projectId=' + projectId, { headers: { 'x-user-id': getUserIdHeader() }}),
            fetch(getTravelApiBase() + '/api/trips/documents?projectId=' + projectId, { headers: { 'x-user-id': getUserIdHeader() }})
        ]);

        currentTripExpenses = await expRes.json();
        currentTripBudgets = await budgRes.json();
        currentTripStops = await stopRes.json();
        currentTripDocs = await docRes.json();

        const extExpenses = currentTripExpenses.filter(e => e.type === 'EXPENSE');
        const extTopups = currentTripExpenses.filter(e => e.type === 'TOPUP');
        const extRefunds = currentTripExpenses.filter(e => e.type === 'REFUND');
        let walletBalance = extTopups.reduce((a,b) => a+b.amount_thb, 0) - extExpenses.reduce((a,b) => a+b.amount_thb, 0) - extRefunds.reduce((a,b) => a+b.amount_thb, 0);

        let members = [];
        try { if(currentTrip.members) members = JSON.parse(currentTrip.members); } 
        catch(e) { if(currentTrip.members) members = currentTrip.members.split(',').map(m=>m.trim()); }

        const html = `
            <div class="travel-modal-header" style="border-bottom: 1px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 15px;">
                <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                    <div>
                        <h2 style="margin:0;">${currentTrip.name} <span style="font-size:0.9rem; color:#888;">(${currentTrip.status})</span></h2>
                        <div style="font-size:0.85rem; color:#64748b;">
                            🗓️ ${currentTrip.start_date||'-'} to ${currentTrip.end_date||'-'} | 
                            ⏱️ Travel: ${currentTrip.travel_duration||'-'} | Tour: ${currentTrip.tour_duration||'-'}
                        </div>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button class="btn btn-sm" style="background:#8b5cf6; color:white;" onclick="endTripSettlement('${currentTrip.project_id}')">🏁 สรุปปิดทริป</button>
                        <button class="btn btn-sm btn-secondary" onclick="openTripGuestLink('${currentTrip.project_id}')"><i class="fa-solid fa-link"></i> ลิงก์กองกลาง</button>
                        <button class="travel-modal-close" onclick="closeTripDetailModal()">✕</button>
                    </div>
                </div>
            </div>
            
            <div class="tabs" style="display:flex; gap:10px; margin-bottom: 20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 0px; flex-wrap:wrap;">
                <button class="tab-btn active" id="tab-btn-overview" onclick="switchTripTab('overview')" style="padding:10px 16px; border:none; background:transparent; font-weight:bold; color:#2563eb; cursor:pointer; border-bottom: 2px solid #2563eb;">📊 Overview</button>
                <button class="tab-btn" id="tab-btn-budget" onclick="switchTripTab('budget')" style="padding:10px 16px; border:none; background:transparent; font-weight:bold; color:#64748b; cursor:pointer;">💼 Budget</button>
                <button class="tab-btn" id="tab-btn-route" onclick="switchTripTab('route')" style="padding:10px 16px; border:none; background:transparent; font-weight:bold; color:#64748b; cursor:pointer;">🗺️ Itinerary</button>
                <button class="tab-btn" id="tab-btn-finance" onclick="switchTripTab('finance')" style="padding:10px 16px; border:none; background:transparent; font-weight:bold; color:#64748b; cursor:pointer;">💰 Expenses & Pool</button>
                <button class="tab-btn" id="tab-btn-docs" onclick="switchTripTab('docs')" style="padding:10px 16px; border:none; background:transparent; font-weight:bold; color:#64748b; cursor:pointer;">📂 Documents</button>
            </div>
            
            <!-- OVERVIEW TAB -->
            <div id="tab-content-overview" class="trip-tab-content" style="display:flex; flex-direction:column; gap:20px;">
                <div style="display:flex; gap:20px; flex-wrap:wrap;">
                    <div style="flex:1; background:#f8fafc; padding:15px; border-radius:12px; min-width:300px;">
                        <h3>Budget vs Actual (Pastel Chart)</h3>
                        <canvas id="tripBudgetChart" width="400" height="200"></canvas>
                    </div>
                    <div style="flex:1; background:#f8fafc; padding:15px; border-radius:12px; min-width:300px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <h3>Trip Members</h3>
                            <button class="btn btn-sm btn-secondary" onclick="manageTripMembers()">Manage</button>
                        </div>
                        <ul style="padding-left:20px; margin-top:10px; color:#334155;">
                            ${members.length > 0 ? members.map(m => `<li>${m}</li>`).join('') : '<li>No members added.</li>'}
                        </ul>
                    </div>
                </div>
            </div>

            <!-- BUDGET TAB -->
            <div id="tab-content-budget" class="trip-tab-content" style="display:none; flex-direction:column; gap:20px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0;">Category Budgets</h3>
                    <button class="btn btn-sm btn-primary" onclick="openManageBudgetsModal()">Edit Budgets</button>
                </div>
                <div style="background:#f8fafc; padding:15px; border-radius:12px;">
                    ${currentTripBudgets.map(b => {
                        const spent = extExpenses.filter(e => e.category_id === b.category_id).reduce((s, e) => s + e.amount_thb, 0);
                        const pct = Math.min(100, (spent / b.amount) * 100).toFixed(1);
                        const bColor = pct > 90 ? '#ffb3ba' : pct > 70 ? '#ffdfba' : '#baffc9';
                        return `
                            <div style="margin-bottom:10px;">
                                <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:4px;">
                                    <span>${b.category_name}</span>
                                    <span>฿${spent.toLocaleString()} / ฿${b.amount.toLocaleString()} (${pct}%)</span>
                                </div>
                                <div style="background:#e2e8f0; border-radius:4px; height:8px; overflow:hidden;">
                                    <div style="background:${bColor}; width:${pct}%; height:100%;"></div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                    ${currentTripBudgets.length === 0 ? '<p style="color:#64748b; font-size:0.85rem;">No budgets set yet.</p>' : ''}
                </div>
            </div>

            <!-- ITINERARY TAB -->
            <div id="tab-content-route" class="trip-tab-content" style="display:none; flex-direction:column; gap:15px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0;">Route Stops</h3>
                    <button class="btn btn-sm btn-primary" onclick="openAddStopModal()">+ Add Stop</button>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${currentTripStops.map(s => {
                        let rests = [];
                        try { rests = JSON.parse(s.restaurants); } catch(e){}
                        return `
                            <div style="border:1px solid #e2e8f0; padding:10px; border-radius:8px; display:flex; gap:10px; background:${s.is_starred ? '#ffecb3' : '#fff'}">
                                <div style="font-size:1.5rem; color:#f59e0b; cursor:pointer;" onclick="toggleStopStar('${s.stop_id}', ${s.is_starred})">
                                    ${s.is_starred ? '⭐' : '☆'}
                                </div>
                                <div style="flex:1;">
                                    <div style="font-weight:bold;">${s.stop_date||''} ${s.time||''} - ${s.city||'Unknown City'}</div>
                                    <div style="font-size:0.85rem; color:#475569;">
                                        🏨 ${s.accommodation||'-'} | 🍽️ ${rests.join(', ')||'-'}
                                    </div>
                                    ${s.notes ? `<div style="font-size:0.8rem; color:#64748b; margin-top:4px;">📝 ${s.notes}</div>` : ''}
                                </div>
                                <div style="display:flex; gap:5px;">
                                    <button class="btn btn-sm" onclick="deleteTripStop('${s.stop_id}')">❌</button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                    ${currentTripStops.length === 0 ? '<p style="color:#64748b; font-size:0.85rem;">No stops added yet.</p>' : ''}
                </div>
            </div>
            
            <!-- FINANCE TAB (Expenses & Pool) -->
            <div id="tab-content-finance" class="trip-tab-content" style="display:none; gap:20px; flex-wrap:wrap;">
                <div style="flex:1; min-width:300px; background:#fff; border:1px solid #e2e8f0; padding:15px; border-radius:12px;">
                    <h3 style="color:#0f172a; margin-top:0;">💵 กองกลาง (Reserve Fund)</h3>
                    <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:15px;">
                        <div style="font-size:0.85rem; color:#64748b;">ยอดเงินคงเหลือ (Pool Balance)</div>
                        <div style="font-size:1.8rem; font-weight:700; color:${walletBalance >= 0 ? '#10b981' : '#ef4444'};">฿${walletBalance.toLocaleString()}</div>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button class="btn btn-sm" style="background:#10b981; color:white; flex:1;" onclick="openAddTopupModal()">💸 Add Reserve Fund</button>
                        <button class="btn btn-sm" style="background:#ef4444; color:white; flex:1;" onclick="openTripExtExpenseModal()">📝 Record Expense</button>
                    </div>
                    
                    <div style="margin-top:15px; max-height:300px; overflow-y:auto;">
                        <table style="width:100%; font-size:0.85rem; border-collapse:collapse;">
                            ${currentTripExpenses.map(e => `
                                <tr style="border-bottom:1px solid #f1f5f9;">
                                    <td style="padding:8px 0; color:#64748b;">${e.expense_date.split('T')[0]}</td>
                                    <td style="padding:8px 0;">
                                        ${e.note || e.category_name || e.type} 
                                        <br><span style="color:#94a1b2; font-size:0.75rem;">Paid by: ${e.member_id || 'Me'}</span>
                                        ${e.receipt_image_url ? `<br><a href="${e.receipt_image_url}" target="_blank" style="font-size:0.7rem; color:#3b82f6;">📎 View Receipt</a>` : ''}
                                    </td>
                                    <td style="padding:8px 0; text-align:right;">
                                        <div style="font-weight:600; color:${e.type==='TOPUP'?'#10b981':'#ef4444'}">
                                            ${e.type==='TOPUP'?'+':'-'}฿${e.amount_thb.toLocaleString()}
                                        </div>
                                        ${e.amount_foreign && e.amount_foreign > 0 ? `<div style="font-size:0.75rem; color:#64748b;">(${e.amount_foreign.toLocaleString()} Foreign)</div>` : ''}
                                    </td>
                                </tr>
                            `).join('')}
                        </table>
                    </div>
                </div>
            </div>

            <!-- DOCUMENTS TAB -->
            <div id="tab-content-docs" class="trip-tab-content" style="display:none; flex-direction:column; gap:15px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0;">Documents & Files</h3>
                    <button class="btn btn-sm btn-primary" onclick="openAddDocModal()">+ Add Document</button>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${currentTripDocs.map(d => {
                        const cat = AppState.categories.find(c => c.category_id === d.related_entity_id);
                        const catName = cat ? cat.name : 'General';
                        return `
                        <div style="border:1px solid #e2e8f0; padding:10px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; background:#fff;">
                            <div>
                                <div style="font-weight:bold;">${d.type.toUpperCase()} <span style="font-size:0.75rem; background:#e2e8f0; padding:2px 6px; border-radius:4px; margin-left:6px;">${catName}</span></div>
                                <div style="font-size:0.85rem; color:#64748b;">${d.description || 'No description'}</div>
                            </div>
                            <div style="display:flex; gap:10px;">
                                <a href="${d.file_url}" target="_blank" class="btn btn-sm" style="background:#e2e8f0; color:#333;">Open</a>
                            </div>
                        </div>
                        `;
                    }).join('')}
                    ${currentTripDocs.length === 0 ? '<p style="color:#64748b; font-size:0.85rem;">No documents attached.</p>' : ''}
                </div>
            </div>
        `;

        document.getElementById('trip-detail-modal-content').innerHTML = html;
        document.getElementById('trip-detail-modal-overlay').classList.remove('hidden');

        // Render Chart.js
        renderTripChart();

    } catch(e) {
        console.error(e);
        alert('Failed to load trip details');
    }
}

function switchTripTab(tabId) {
    document.querySelectorAll('.trip-tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(el => {
        el.classList.remove('active');
        el.style.borderBottom = 'none';
        el.style.color = '#64748b';
    });
    
    document.getElementById('tab-content-' + tabId).style.display = (tabId === 'finance') ? 'flex' : 'flex';
    
    const activeBtn = document.getElementById('tab-btn-' + tabId);
    activeBtn.classList.add('active');
    activeBtn.style.borderBottom = '2px solid #2563eb';
    activeBtn.style.color = '#2563eb';
}

function closeTripDetailModal() {
    document.getElementById('trip-detail-modal-overlay').classList.add('hidden');
}

function openTripGuestLink(projectId) {
    const url = window.location.origin + window.location.pathname.replace('index.html', '') + 'guest.html?id=' + projectId;
    prompt('คัดลอกลิงก์นี้ส่งให้เพื่อน (เพื่อนต้องใช้ Trip Password ในการเข้าดู):', url);
}

// -------------------------
// EXTERNAL WALLET ACTIONS (TOPUP / EXPENSE / REFUND)
// -------------------------
let currentActionType = 'EXPENSE';
let expenseImageBase64 = null;

function openTripExtExpenseModal() {
    currentActionType = 'EXPENSE';
    document.querySelector('#add-expense-modal .travel-modal-header h2').innerHTML = '📸 บันทึกค่าใช้จ่าย (Record Expense)';
    
    // Hide default footer to avoid collisions
    const footer = document.querySelector('#add-expense-modal .travel-modal-footer');
    if(footer) footer.style.display = 'none';

    
    // Initial view: Just file upload button
    document.getElementById('add-expense-modal-body').innerHTML = `
        <div style="text-align:center; padding: 20px;">
            <label for="expense-file-upload" class="btn btn-primary" style="cursor:pointer; display:inline-block; margin-bottom:10px;">
                📎 แนบสลิป / รูปใบเสร็จ (Attach File)
            </label>
            <input type="file" id="expense-file-upload" accept="image/*" style="display:none;" onchange="onExpenseFileSelected(event)">
            <p style="font-size:0.85rem; color:#64748b;">Or enter details manually below</p>
            <button class="btn btn-sm btn-secondary" onclick="renderExpenseForm()">📝 กรอกข้อมูลเอง (Manual Entry)</button>
            <div style="margin-top: 20px;">
                <button class="btn-travel-secondary" onclick="closeTripExtExpenseModal()">ยกเลิก (Cancel)</button>
            </div>
        </div>
    `;
    
    document.getElementById('add-expense-modal').classList.remove('hidden');
}

function onExpenseFileSelected(e) {
    const file = e.target.files[0];
    if(!file) return;
    
    const reader = new FileReader();
    reader.onload = function(evt) {
        expenseImageBase64 = evt.target.result;
        renderExpenseForm();
    };
    reader.readAsDataURL(file);
}

function renderExpenseForm() {
    let members = [];
    try { if(currentTrip.members) members = JSON.parse(currentTrip.members); } catch(e){}
    const defaultUser = getUserIdHeader();
    
    let memberOptions = members.map(m => `<option value="${m}" ${m===defaultUser?'selected':''}>${m}</option>`).join('');
    if(members.length === 0) memberOptions = `<option value="${defaultUser}">${defaultUser}</option>`;

    let budgetOptions = currentTripBudgets.map(b => `<option value="${b.category_id}">${b.category_name}</option>`).join('');
    
    document.getElementById('add-expense-modal-body').innerHTML = `
        ${expenseImageBase64 ? `<div style="text-align:center; margin-bottom:15px;"><img src="${expenseImageBase64}" style="max-height:100px; border-radius:8px;"></div>` : ''}
        
        <div class="travel-form-group">
            <label>หมวดหมู่ (Category)</label>
            <select id="ext-category">
                <option value="">-- Select Category --</option>
                ${budgetOptions}
            </select>
        </div>
        <div class="travel-form-group">
            <label>จำนวนเงิน (Amount THB)</label>
            <input type="number" id="ext-amount" placeholder="0.00">
        </div>
        <div class="travel-form-group">
            <label>สกุลเงินต่างประเทศ (Foreign Amount - Optional)</label>
            <input type="number" id="ext-amount-foreign" placeholder="0.00">
        </div>
        <div class="travel-form-group">
            <label>ใครเป็นคนจ่าย (Paid By)</label>
            <select id="ext-member">
                ${memberOptions}
            </select>
        </div>
        <div class="travel-form-group">
            <label>จ่ายผ่าน (Payment Method)</label>
            <select id="ext-method">
                <option value="cash">เงินสด (Cash)</option>
                <option value="transfer">โอนเงิน/สแกนจ่าย (Transfer/QR)</option>
                <option value="card">บัตรเครดิต (Credit Card)</option>
            </select>
        </div>
        <div class="travel-form-group">
            <label>รายละเอียด/ร้านค้า (Note/Merchant)</label>
            <input type="text" id="ext-note" placeholder="เช่น ค่าอาหารเย็น, ค่าตั๋วรถไฟ">
        </div>
        <div class="travel-form-group" style="display:none;">
            <label>วันที่</label>
            <input type="date" id="ext-date" value="${new Date().toISOString().split('T')[0]}">
        </div>
        
        <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
            <button class="btn-travel-secondary" onclick="closeTripExtExpenseModal()">ยกเลิก</button>
            <button class="btn-travel-primary" onclick="saveTripExtExpense()">✅ บันทึก</button>
        </div>
    `;
}

function openAddTopupModal() {
    currentActionType = 'TOPUP';
    document.querySelector('#add-expense-modal .travel-modal-header h2').innerHTML = '💸 เติมเงินเข้ากองกลาง (Reserve Fund)';
    expenseImageBase64 = null;
    
    let members = [];
    try { if(currentTrip.members) members = JSON.parse(currentTrip.members); } catch(e){}
    const defaultUser = getUserIdHeader();
    let memberOptions = members.map(m => `<option value="${m}" ${m===defaultUser?'selected':''}>${m}</option>`).join('');
    if(members.length === 0) memberOptions = `<option value="${defaultUser}">${defaultUser}</option>`;

    document.getElementById('add-expense-modal-body').innerHTML = `
        <div class="travel-form-group">
            <label>จำนวนเงิน (Amount THB)</label>
            <input type="number" id="ext-amount" placeholder="0.00">
        </div>
        <div class="travel-form-group">
            <label>สมาชิกที่โอนเข้ากองกลาง (Member)</label>
            <select id="ext-member">
                ${memberOptions}
            </select>
        </div>
        <div class="travel-form-group">
            <label>หมายเหตุ</label>
            <input type="text" id="ext-note" placeholder="โอนเงินเข้ากองกลาง">
        </div>
        <input type="hidden" id="ext-date" value="${new Date().toISOString().split('T')[0]}">
    `;
    
    document.getElementById('add-expense-modal').classList.remove('hidden');
}

function closeTripExtExpenseModal() {
    document.getElementById('add-expense-modal').classList.add('hidden');
    expenseImageBase64 = null;
    
    // Restore default footer
    const footer = document.querySelector('#add-expense-modal .travel-modal-footer');
    if(footer) footer.style.display = 'flex';
}

async function saveTripExtExpense() {
    if(!currentTrip) return;
    
    const amountEl = document.getElementById('ext-amount');
    if(!amountEl) return alert('กรุณากรอกข้อมูลก่อนบันทึก (Please fill the form)');
    
    const amount = parseFloat(amountEl.value);
    if(isNaN(amount) || amount <= 0) return alert('ระบุจำนวนเงิน');

    const catEl = document.getElementById('ext-category');
    const noteEl = document.getElementById('ext-note');
    const memberEl = document.getElementById('ext-member');
    const fAmountEl = document.getElementById('ext-amount-foreign');
    const methodEl = document.getElementById('ext-method');

    let finalNote = noteEl ? noteEl.value : '';
    if(methodEl && methodEl.value) {
        finalNote += ` [${methodEl.value}]`;
    }

    const data = {
        project_id: currentTrip.project_id,
        expense_date: document.getElementById('ext-date').value,
        amount_thb: amount,
        amount_foreign: fAmountEl && fAmountEl.value ? parseFloat(fAmountEl.value) : null,
        member_id: memberEl ? memberEl.value : '',
        category_id: catEl ? catEl.value : null,
        note: finalNote,
        type: currentActionType,
        receipt_image_url: expenseImageBase64 // Will save base64 to DB (ensure D1 limits are respected or shrink image later)
    };

    try {
        const res = await fetch(getTravelApiBase() + '/api/trip-expenses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': getUserIdHeader() },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if(result.success) {
            closeTripExtExpenseModal();
            openTripDetail(currentTrip.project_id); // Refresh
        } else {
            alert('Error: ' + result.error);
        }
    } catch(e) {
        console.error(e);
        alert('Failed to save');
    }
}

// -------------------------
// OTHER MODALS (STOPS, DOCS, SETTLEMENT)
// -------------------------
async function endTripSettlement(projectId) {
    if(!confirm('คุณแน่ใจหรือไม่ที่จะสรุปปิดทริป? ระบบจะคำนวณและสร้างรายการคืนเงิน/จ่ายเพิ่มให้ (Are you sure you want to close and settle this trip?)')) return;
    try {
        const res = await fetch(getTravelApiBase() + '/api/trips/settle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': getUserIdHeader() },
            body: JSON.stringify({ project_id: projectId })
        });
        const result = await res.json();
        if(result.success) {
            alert('ปิดทริปสำเร็จ (Trip settled successfully)');
            closeTripDetailModal();
            loadTrips();
        } else {
            alert('Error: ' + result.error);
        }
    } catch(err) {
        console.error(err);
        alert('Failed to settle trip');
    }
}

function openAddStopModal() {
    // We can reuse the add expense modal UI for now or create a new one.
    // For simplicity, we just prompt to keep tokens low or create a simple form.
    const city = prompt("City Name:");
    if(!city) return;
    const acc = prompt("Accommodation:");
    const notes = prompt("Notes:");
    
    const stopData = {
        project_id: currentTrip.project_id,
        city: city,
        accommodation: acc,
        notes: notes,
        is_starred: false
    };

    fetch(getTravelApiBase() + '/api/trips/stops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': getUserIdHeader() },
        body: JSON.stringify(stopData)
    }).then(r => r.json()).then(res => {
        if(res.success) openTripDetail(currentTrip.project_id);
    });
}

async function openAddDocModal() {
    const catList = AppState.categories.map(c => c.category_id + ': ' + c.name).join('\n');
    const input = prompt('Enter document details in format: CategoryID, Description, URL\n\nCategories:\n' + catList + '\n\nExample: CAT-1, E-Ticket, https://example.com/ticket.pdf', '');
    
    if (input) {
        const parts = input.split(',').map(p => p.trim());
        if (parts.length >= 3) {
            const catId = parts[0];
            const desc = parts[1];
            const url = parts.slice(2).join(','); // in case url has commas
            
            try {
                const res = await fetch(getTravelApiBase() + '/api/trips/documents', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-user-id': getUserIdHeader() },
                    body: JSON.stringify({
                        project_id: currentTrip.project_id,
                        related_entity_id: catId,
                        file_url: url,
                        description: desc,
                        type: 'FILE'
                    })
                });
                if (res.ok) {
                    openTripDetail(currentTrip.project_id);
                } else {
                    alert('Failed to add document');
                }
            } catch(e) {
                console.error(e);
                alert('Error adding document');
            }
        } else {
            alert('Invalid format. Please use: CategoryID, Description, URL');
        }
    }
}

function toggleStopStar(stopId, currentStatus) {
    fetch(getTravelApiBase() + '/api/trips/stops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': getUserIdHeader() },
        body: JSON.stringify({
            stop_id: stopId,
            project_id: currentTrip.project_id,
            is_starred: !currentStatus
        })
    }).then(r => r.json()).then(res => {
        if(res.success) openTripDetail(currentTrip.project_id);
    });
}

// Hook into initial nav logic to load trips when travel tab is opened
document.addEventListener('DOMContentLoaded', () => {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            if(item.getAttribute('data-target') === 'travel') {
                loadTrips();
            }
        });
    });
});

// --- New Feature Helpers ---

async function manageTripMembers() {
    let members = [];
    try { if(currentTrip.members) members = JSON.parse(currentTrip.members); } 
    catch(e) { if(currentTrip.members) members = currentTrip.members.split(',').map(m=>m.trim()); }
    
    const input = prompt('Enter members separated by comma (e.g. Nick, Nay, Bee):', members.join(', '));
    if (input !== null) {
        const newMembers = input.split(',').map(m => m.trim()).filter(m => m);
        try {
            const res = await fetch(getTravelApiBase() + '/api/trips/members', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'x-user-id': getUserIdHeader() },
                body: JSON.stringify({ project_id: currentTrip.project_id, members: JSON.stringify(newMembers) })
            });
            if (res.ok) {
                openTripDetail(currentTrip.project_id);
                renderTripsView();
            } else {
                alert('Failed to update members');
            }
        } catch(e) {
            console.error(e);
            alert('Error updating members');
        }
    }
}

function openManageBudgetsModal() {
    const catList = AppState.categories.map(c => c.category_id + ': ' + c.name).join('\n');
    const input = prompt('Enter budgets in format: CategoryID=Amount, separated by comma.\nCategories:\n' + catList + '\n\nExample: CAT-1=5000, CAT-2=1000', '');
    
    if (input) {
        const parts = input.split(',').map(p => p.trim());
        const budgets = [];
        for (const p of parts) {
            const split_idx = p.indexOf('=');
            if (split_idx !== -1) {
                const c_id = p.substring(0, split_idx).trim();
                const amt = p.substring(split_idx + 1).trim();
                if (c_id && amt && !isNaN(amt)) {
                    budgets.push({ category_id: c_id, amount: parseFloat(amt) });
                }
            }
        }
        
        if (budgets.length > 0) {
            fetch(getTravelApiBase() + '/api/trips/budgets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-user-id': getUserIdHeader() },
                body: JSON.stringify({ project_id: currentTrip.project_id, budgets })
            }).then(r => r.json()).then(res => {
                if (res.success) openTripDetail(currentTrip.project_id);
            }).catch(e => {
                console.error(e);
                alert('Error saving budgets');
            });
        }
    }
}

async function toggleStopStar(stop_id, is_starred) {
    try {
        const res = await fetch(getTravelApiBase() + '/api/trips/stops/star', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-user-id': getUserIdHeader() },
            body: JSON.stringify({ stop_id, is_starred: !is_starred })
        });
        if (res.ok) openTripDetail(currentTrip.project_id);
    } catch(e) { console.error(e); }
}

async function deleteTripStop(stop_id) {
    if(!confirm('Delete this stop?')) return;
    try {
        const res = await fetch(getTravelApiBase() + '/api/trips/stops/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': getUserIdHeader() },
            body: JSON.stringify({ stop_id })
        });
        if (res.ok) openTripDetail(currentTrip.project_id);
    } catch(e) { console.error(e); }
}

function renderTripChart() {
    const canvas = document.getElementById('tripBudgetChart');
    if (!canvas) return;
    
    const labels = [];
    const budgetData = [];
    const spentData = [];
    
    const extExpenses = currentTripExpenses.filter(e => e.type === 'EXPENSE');

    currentTripBudgets.forEach(b => {
        labels.push(b.category_name);
        budgetData.push(b.amount);
        const spent = extExpenses.filter(e => e.category_id === b.category_id).reduce((s, e) => s + e.amount_thb, 0);
        spentData.push(spent);
    });

    if (window.tripChartInstance) {
        window.tripChartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');
    window.tripChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Budget',
                    data: budgetData,
                    backgroundColor: '#baffc9',
                },
                {
                    label: 'Actual Spent',
                    data: spentData,
                    backgroundColor: '#ffb3ba',
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}
