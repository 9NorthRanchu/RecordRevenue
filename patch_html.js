const fs = require('fs');
let html = fs.readFileSync('frontend/index.html', 'utf8');

// Add Tab Button
html = html.replace(
  /<button class="tab-btn" onclick="switchTab\('tab-settings'\)">⚙️ ตั้งค่า<\/button>/,
  '<button class="tab-btn" onclick="switchTab(\'tab-ar\')">🧾 ลูกหนี้คงค้าง</button>\n            <button class="tab-btn" onclick="switchTab(\'tab-settings\')">⚙️ ตั้งค่า</button>'
);

// Add Tab Content
const arTabContent = `
        <!-- Outstanding AR Tab -->
        <div id="tab-ar" class="tab-content" style="display: none;">
            <div class="content-header">
                <h2>🧾 ลูกหนี้/เจ้าหนี้คงค้าง (Outstanding AR/AP)</h2>
                <button class="btn btn-primary" onclick="loadOutstandingAR()">🔄 รีเฟรช</button>
            </div>
            <div class="card" style="padding: 1rem;">
                <table class="data-table" id="table-outstanding-ar">
                    <thead>
                        <tr>
                            <th>วันที่ตั้งหนี้</th>
                            <th>รายการ</th>
                            <th>หมวดหมู่</th>
                            <th>ลูกค้า/บุคคล</th>
                            <th>บริษัท</th>
                            <th style="text-align: right;">ยอดตั้งต้น</th>
                            <th style="text-align: right;">ชำระแล้ว</th>
                            <th style="text-align: right;">คงเหลือ</th>
                        </tr>
                    </thead>
                    <tbody>
                        <!-- AR items injected here -->
                    </tbody>
                </table>
            </div>
        </div>
`;
html = html.replace(
  /<!-- Settings Tab -->/,
  arTabContent + '\n        <!-- Settings Tab -->'
);

fs.writeFileSync('frontend/index.html', html);
console.log('HTML patched');
