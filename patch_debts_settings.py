import re

html_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/index.html"
with open(html_path, 'r') as f:
    html = f.read()

# 1. Add hidden to debt-modal
html = html.replace('<div id="debt-modal" class="modal">', '<div id="debt-modal" class="modal hidden">')

# 2. Add Settings Tab for Debts
tabs_insert_pos = html.find('<button class="settings-tab" data-settings-tab="opening-balances">⚖️ ยอดยกมา</button>')
if tabs_insert_pos != -1 and 'data-settings-tab="debts"' not in html:
    html = html[:tabs_insert_pos] + '<button class="settings-tab" data-settings-tab="debts">📝 ทะเบียนหนี้สิน</button>\n                                ' + html[tabs_insert_pos:]

# 3. Add Settings Section for Debts
section_insert_pos = html.find('<!-- Opening Balances Tab -->')
if section_insert_pos != -1 and 'id="settings-debts"' not in html:
    debts_settings_html = """
                            <!-- Debts Tab -->
                            <div id="settings-debts" class="settings-section-content hidden">
                                <div class="settings-section-header" style="display: flex; justify-content: space-between; align-items: center;">
                                    <h4>📝 ตั้งค่าโปรไฟล์หนี้สิน (Debt Profiles)</h4>
                                    <button class="btn btn-primary" onclick="showDebtModal()"><i class="fa-solid fa-plus"></i> เพิ่มสัญญาหนี้</button>
                                </div>
                                <div class="table-responsive card glass" style="margin-top: 15px;">
                                    <table class="table">
                                        <thead>
                                            <tr>
                                                <th>ชื่อรายการ</th>
                                                <th>ประเภท</th>
                                                <th>ยอดหนี้เริ่มต้น</th>
                                                <th>ค่างวด</th>
                                                <th>จัดการ</th>
                                            </tr>
                                        </thead>
                                        <tbody id="settings-debts-body">
                                            <!-- Dynamic Debt Rows -->
                                        </tbody>
                                    </table>
                                </div>
                            </div>
"""
    html = html[:section_insert_pos] + debts_settings_html + html[section_insert_pos:]

# 4. Remove the add button from view-debtor
html = html.replace('<button class="btn btn-primary" onclick="showDebtModal()"><i class="fa-solid fa-plus"></i> เพิ่มสัญญาหนี้</button>', '')

with open(html_path, 'w') as f:
    f.write(html)

print("Patched index.html")
