html_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/index.html"
with open(html_path, 'r') as f:
    html = f.read()

start_marker = '<!-- Debt Profile Modal -->'
end_marker = '<!-- /Debt Profile Modal -->'

start_idx = html.find(start_marker)
end_idx = html.find(end_marker) + len(end_marker)

new_modal = """<!-- Debt Profile Modal -->
    <div id="debt-modal" class="modal-overlay hidden" style="align-items: center; justify-content: center; z-index: 1000;">
        <div class="modal-content" style="width: 95%; max-width: 550px; background: rgba(248, 250, 252, 0.95); backdrop-filter: blur(12px); border-radius: 20px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.4); max-height: 90vh; display: flex; flex-direction: column; overflow: hidden;">
            <div class="modal-header" style="padding: 15px 20px; border-bottom: 1px solid rgba(226, 232, 240, 0.8); display: flex; justify-content: space-between; align-items: center; background: rgba(255, 255, 255, 0.5);">
                <h3 id="debt-modal-title" style="margin: 0; font-size: 1.3rem; color: #0284c7; font-weight: 700;">Debt Profile</h3>
                <span class="close-modal" onclick="closeDebtModal()" style="font-size: 1.5rem; cursor: pointer; color: #64748b; line-height: 1;">&times;</span>
            </div>
            <div class="modal-body" style="padding: 15px 20px; overflow-y: auto;">
                <form id="debt-form" onsubmit="saveDebtProfile(event)">
                    <input type="hidden" id="debt-id">
                    <input type="hidden" id="debt-icon-type" value="zodiac_1.png">
                    
                    <!-- Icon Selector (Compact) -->
                    <div style="background: rgba(255,255,255,0.8); border-radius: 12px; padding: 10px; border: 1px solid rgba(226, 232, 240, 0.8); margin-bottom: 15px;">
                        <div class="icon-tabs" style="display: flex; gap: 4px; margin-bottom: 8px; overflow-x: auto; white-space: nowrap; scrollbar-width: none; -ms-overflow-style: none;">
                            <button type="button" class="btn btn-sm btn-outline active" onclick="switchIconTab('zodiac')" style="flex-shrink: 0; border-radius: 12px; font-size: 0.7rem; padding: 3px 8px;">Zodiac</button>
                            <button type="button" class="btn btn-sm btn-outline" onclick="switchIconTab('hokkaido')" style="flex-shrink: 0; border-radius: 12px; font-size: 0.7rem; padding: 3px 8px;">Hokkaido</button>
                            <button type="button" class="btn btn-sm btn-outline" onclick="switchIconTab('china')" style="flex-shrink: 0; border-radius: 12px; font-size: 0.7rem; padding: 3px 8px;">China</button>
                            <button type="button" class="btn btn-sm btn-outline" onclick="switchIconTab('japan')" style="flex-shrink: 0; border-radius: 12px; font-size: 0.7rem; padding: 3px 8px;">Japan</button>
                            <button type="button" class="btn btn-sm btn-outline" onclick="switchIconTab('mascot')" style="flex-shrink: 0; border-radius: 12px; font-size: 0.7rem; padding: 3px 8px;">Mascot</button>
                            <button type="button" class="btn btn-sm btn-outline" onclick="switchIconTab('onepiece')" style="flex-shrink: 0; border-radius: 12px; font-size: 0.7rem; padding: 3px 8px;">One Piece</button>
                        </div>
                        <div id="icon-grid" tabindex="0" style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; max-height: 140px; overflow-y: auto; outline: none; padding-right: 2px;">
                            <!-- Rendered by JS -->
                        </div>
                    </div>

                    <!-- Form Fields -->
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 12px;">
                            <div class="form-group">
                                <label style="font-size: 0.8rem; font-weight: 600; color: #475569; margin-bottom: 4px;">Name</label>
                                <input type="text" id="debt-name" class="form-control form-control-sm" placeholder="e.g. Mortgage" style="background: rgba(255,255,255,0.8); border-radius: 8px;" required>
                            </div>
                            <div class="form-group">
                                <label style="font-size: 0.8rem; font-weight: 600; color: #475569; margin-bottom: 4px;">Type</label>
                                <select id="debt-type" class="form-control form-control-sm" style="background: rgba(255,255,255,0.8); border-radius: 8px;" required>
                                    <option value="PAYABLE">Payable</option>
                                    <option value="RECEIVABLE">Receivable</option>
                                </select>
                            </div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                            <div class="form-group">
                                <label style="font-size: 0.8rem; font-weight: 600; color: #475569; margin-bottom: 4px;">Contact</label>
                                <select id="debt-contact" class="form-control form-control-sm" style="background: rgba(255,255,255,0.8); border-radius: 8px;" required></select>
                            </div>
                            <div class="form-group">
                                <label style="font-size: 0.8rem; font-weight: 600; color: #475569; margin-bottom: 4px;">Start Date</label>
                                <input type="date" id="debt-start-date" class="form-control form-control-sm" style="background: rgba(255,255,255,0.8); border-radius: 8px;">
                            </div>
                        </div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                            <div class="form-group">
                                <label style="font-size: 0.8rem; font-weight: 600; color: #475569; margin-bottom: 4px;">Start Balance</label>
                                <input type="text" inputmode="decimal" id="debt-start-balance" class="form-control form-control-sm" placeholder="0.00" style="background: rgba(255,255,255,0.8); border-radius: 8px;" onfocus="this.value = parseFormattedNum(this.value) || ''" onblur="this.value = formatCurrency(parseFormattedNum(this.value))" required>
                            </div>
                            <div class="form-group">
                                <label style="font-size: 0.8rem; font-weight: 600; color: #475569; margin-bottom: 4px;">Installment / Month</label>
                                <input type="text" inputmode="decimal" id="debt-installment" class="form-control form-control-sm" placeholder="0.00" style="background: rgba(255,255,255,0.8); border-radius: 8px;" onfocus="this.value = parseFormattedNum(this.value) || ''" onblur="this.value = formatCurrency(parseFormattedNum(this.value))">
                            </div>
                        </div>
                        
                        <div style="padding: 10px 12px; background: rgba(241, 245, 249, 0.7); border-radius: 10px; border: 1px solid rgba(226, 232, 240, 0.8);">
                            <h4 style="margin: 0 0 8px 0; font-size: 0.75rem; color: #334155;"><i class="fa-solid fa-link"></i> Category Mapping</h4>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                                <div class="form-group" style="margin-bottom: 0;">
                                    <label style="font-size: 0.7rem; font-weight: 600; color: #64748b; margin-bottom: 2px;">Principal</label>
                                    <select id="debt-principal-category" class="form-control form-control-sm" style="background: white; border-radius: 6px;" required></select>
                                </div>
                                <div class="form-group" style="margin-bottom: 0;">
                                    <label style="font-size: 0.7rem; font-weight: 600; color: #64748b; margin-bottom: 2px;">Interest</label>
                                    <select id="debt-interest-category" class="form-control form-control-sm" style="background: white; border-radius: 6px;"></select>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-actions" style="margin-top: 15px; display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid rgba(226, 232, 240, 0.8); padding-top: 15px;">
                        <button type="button" class="btn btn-secondary btn-sm" onclick="closeDebtModal()" style="border-radius: 8px; font-weight: 600; padding: 6px 16px;">Cancel</button>
                        <button type="submit" class="btn btn-primary btn-sm" style="border-radius: 8px; font-weight: 600; padding: 6px 20px; background: linear-gradient(135deg, #0ea5e9, #2563eb); border: none; box-shadow: 0 4px 10px rgba(37,99,235,0.2);">Save</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
    <!-- /Debt Profile Modal -->"""

html = html[:start_idx] + new_modal + html[end_idx:]
with open(html_path, 'w') as f:
    f.write(html)
print("Patched modal HTML for Top-Down Compact!")
