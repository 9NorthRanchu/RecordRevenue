import re

file_path = "frontend/index.html"
with open(file_path, 'r') as f:
    content = f.read()

new_debt_view = """                <!-- 5. Debtor / Creditor View -->
                <section id="view-debtor" class="content-view hidden">
                    <div class="view-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h2><i class="fa-solid fa-hand-holding-dollar"></i> ทะเบียนหนี้สิน (Debt Portfolio)</h2>
                        <button class="btn btn-primary" onclick="showDebtModal()"><i class="fa-solid fa-plus"></i> เพิ่มสัญญาหนี้</button>
                    </div>

                    <div class="debts-dashboard">
                        <!-- Summary Cards -->
                        <div class="row" style="display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap;">
                            <div class="card glass" style="flex: 1; min-width: 250px;">
                                <div class="card-body" style="text-align: center;">
                                    <h4 style="color: var(--text-secondary); margin-bottom: 10px;">หนี้สินที่ต้องจ่าย (Payable)</h4>
                                    <h2 id="total-payable-balance" style="color: var(--danger-color); font-size: 2rem;">฿0.00</h2>
                                </div>
                            </div>
                            <div class="card glass" style="flex: 1; min-width: 250px;">
                                <div class="card-body" style="text-align: center;">
                                    <h4 style="color: var(--text-secondary); margin-bottom: 10px;">เงินให้กู้ยืม (Receivable)</h4>
                                    <h2 id="total-receivable-balance" style="color: var(--success-color); font-size: 2rem;">฿0.00</h2>
                                </div>
                            </div>
                        </div>

                        <!-- Tabs -->
                        <div class="tabs" style="display: flex; gap: 10px; margin-bottom: 20px;">
                            <button class="btn btn-outline active" id="tab-payable" onclick="switchDebtTab('PAYABLE')">หนี้สินที่ต้องจ่าย</button>
                            <button class="btn btn-outline" id="tab-receivable" onclick="switchDebtTab('RECEIVABLE')">เงินให้กู้ยืม</button>
                        </div>

                        <!-- Progress Cards Container -->
                        <div id="debts-cards-container" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px;">
                            <!-- Cards will be injected here -->
                        </div>
                    </div>
                </section>"""

# Replace the old view-debtor
pattern = re.compile(r'<!-- 5\. Debtor / Creditor View -->.*?<!-- 6\. Reports View -->', re.DOTALL)
content = pattern.sub(new_debt_view + '\n\n                <!-- 6. Reports View -->', content)

# I also need to add the Modal for creating/editing debts. I'll put it at the end of the body, near other modals.
modal_html = """
    <!-- Debt Profile Modal -->
    <div id="debt-modal" class="modal">
        <div class="modal-content glass" style="max-width: 500px;">
            <div class="modal-header">
                <h3 id="debt-modal-title">สร้างโปรไฟล์หนี้ใหม่</h3>
                <span class="close-modal" onclick="closeDebtModal()">&times;</span>
            </div>
            <div class="modal-body">
                <form id="debt-form">
                    <input type="hidden" id="debt-id">
                    <div class="form-group">
                        <label>ประเภทหนี้</label>
                        <select id="debt-type" class="form-control" required>
                            <option value="PAYABLE">หนี้สินที่ต้องจ่าย (Payable)</option>
                            <option value="RECEIVABLE">เงินให้กู้ยืม (Receivable)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>ชื่อรายการ (เช่น สินเชื่อบ้าน ธอส.)</label>
                        <input type="text" id="debt-name" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label>คู่ค้า/บุคคล (Contact)</label>
                        <select id="debt-contact" class="form-control" required></select>
                    </div>
                    <div class="form-group">
                        <label>ยอดหนี้เริ่มต้น (บาท)</label>
                        <input type="number" step="0.01" id="debt-start-balance" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label>ค่างวดต่อเดือน (บาท)</label>
                        <input type="number" step="0.01" id="debt-installment" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>วันที่เริ่ม (Start Date)</label>
                        <input type="date" id="debt-start-date" class="form-control">
                    </div>
                    <hr>
                    <div class="form-group">
                        <label>หมวดหมู่เงินต้น (Principal Category)</label>
                        <select id="debt-principal-category" class="form-control" required></select>
                        <small style="color: #666;">หมวดหมู่ที่จะถูกตัดยอดเมื่อจ่ายเงินต้น</small>
                    </div>
                    <div class="form-group">
                        <label>หมวดหมู่ดอกเบี้ย (Interest Category)</label>
                        <select id="debt-interest-category" class="form-control"></select>
                        <small style="color: #666;">หมวดหมู่ที่จะถูกบันทึกเมื่อจ่ายดอกเบี้ย</small>
                    </div>
                    <div class="form-actions" style="margin-top: 20px; text-align: right;">
                        <button type="button" class="btn btn-outline" onclick="closeDebtModal()">ยกเลิก</button>
                        <button type="submit" class="btn btn-primary">บันทึกข้อมูล</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
    <!-- /Debt Profile Modal -->
"""

if 'id="debt-modal"' not in content:
    content = content.replace('</body>', modal_html + '\n</body>')

with open(file_path, 'w') as f:
    f.write(content)
print("Patched Debts HTML.")
