import re

html_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/index.html"
with open(html_path, 'r') as f:
    html = f.read()

old_modal = re.search(r'<!-- Debt Profile Modal -->.*?<!-- /Debt Profile Modal -->', html, re.DOTALL)
if old_modal:
    new_modal = """<!-- Debt Profile Modal -->
    <div id="debt-modal" class="modal hidden">
        <div class="modal-content glass" style="max-width: 500px; padding: 25px; border-radius: 16px;">
            <div class="modal-header" style="border-bottom: 1px solid rgba(0,0,0,0.1); padding-bottom: 15px; margin-bottom: 20px;">
                <h3 id="debt-modal-title" style="margin: 0; font-size: 1.4rem; color: #0284c7; font-weight: 700;">Debt Profile</h3>
                <span class="close-modal" onclick="closeDebtModal()" style="font-size: 1.5rem; cursor: pointer; color: #64748b;">&times;</span>
            </div>
            <div class="modal-body">
                <form id="debt-form" onsubmit="saveDebtProfile(event)">
                    <input type="hidden" id="debt-id">
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group">
                            <label style="font-size: 0.85rem; font-weight: 600; color: #475569; margin-bottom: 5px;">Type</label>
                            <select id="debt-type" class="form-control" style="background: rgba(255,255,255,0.7); border-radius: 8px;" required>
                                <option value="PAYABLE">Payable</option>
                                <option value="RECEIVABLE">Receivable</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label style="font-size: 0.85rem; font-weight: 600; color: #475569; margin-bottom: 5px;">Start Date</label>
                            <input type="date" id="debt-start-date" class="form-control" style="background: rgba(255,255,255,0.7); border-radius: 8px;">
                        </div>
                    </div>

                    <div class="form-group" style="margin-top: 10px;">
                        <label style="font-size: 0.85rem; font-weight: 600; color: #475569; margin-bottom: 5px;">Name</label>
                        <input type="text" id="debt-name" class="form-control" placeholder="e.g. Mortgage" style="background: rgba(255,255,255,0.7); border-radius: 8px;" required>
                    </div>

                    <div class="form-group" style="margin-top: 10px;">
                        <label style="font-size: 0.85rem; font-weight: 600; color: #475569; margin-bottom: 5px;">Contact</label>
                        <select id="debt-contact" class="form-control" style="background: rgba(255,255,255,0.7); border-radius: 8px;" required></select>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 10px;">
                        <div class="form-group">
                            <label style="font-size: 0.85rem; font-weight: 600; color: #475569; margin-bottom: 5px;">Start Balance</label>
                            <input type="number" step="0.01" id="debt-start-balance" class="form-control" placeholder="0.00" style="background: rgba(255,255,255,0.7); border-radius: 8px;" required>
                        </div>
                        <div class="form-group">
                            <label style="font-size: 0.85rem; font-weight: 600; color: #475569; margin-bottom: 5px;">Monthly Installment</label>
                            <input type="number" step="0.01" id="debt-installment" class="form-control" placeholder="0.00" style="background: rgba(255,255,255,0.7); border-radius: 8px;">
                        </div>
                    </div>
                    
                    <div style="margin-top: 20px; padding: 15px; background: rgba(241, 245, 249, 0.5); border-radius: 12px; border: 1px solid rgba(226, 232, 240, 0.8);">
                        <h4 style="margin: 0 0 10px 0; font-size: 0.9rem; color: #334155;"><i class="fa-solid fa-link"></i> Category Mapping</h4>
                        <div class="form-group" style="margin-bottom: 10px;">
                            <label style="font-size: 0.8rem; font-weight: 600; color: #64748b; margin-bottom: 5px;">Principal Category</label>
                            <select id="debt-principal-category" class="form-control form-control-sm" style="background: white; border-radius: 6px;" required></select>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="font-size: 0.8rem; font-weight: 600; color: #64748b; margin-bottom: 5px;">Interest Category</label>
                            <select id="debt-interest-category" class="form-control form-control-sm" style="background: white; border-radius: 6px;"></select>
                        </div>
                    </div>
                    
                    <div class="form-actions" style="margin-top: 25px; display: flex; justify-content: flex-end; gap: 10px;">
                        <button type="button" class="btn btn-secondary" onclick="closeDebtModal()" style="border-radius: 8px; font-weight: 600;">Cancel</button>
                        <button type="submit" class="btn btn-primary" style="border-radius: 8px; font-weight: 600; padding: 10px 20px; background: linear-gradient(135deg, #0ea5e9, #2563eb); border: none; box-shadow: 0 4px 10px rgba(37,99,235,0.2);">Save</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
    <!-- /Debt Profile Modal -->"""
    
    html = html.replace(old_modal.group(0), new_modal)
    with open(html_path, 'w') as f:
        f.write(html)
    print("Modal updated successfully")
else:
    print("Could not find old modal")

