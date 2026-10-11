import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/index.html"
with open(app_js_path, 'r') as f:
    html = f.read()

# Extract the icon selector block
icon_selector_pattern = re.compile(r'(\s*<div class="form-group" style="margin-top: 10px;">\s*<label style="font-size: 0.85rem; font-weight: 600; color: #475569; margin-bottom: 5px;">Icon Style</label>.*?</div>\s*</div>)', re.DOTALL)
match = icon_selector_pattern.search(html)

if match:
    icon_selector = match.group(1)
    # Remove from old position
    html = html.replace(icon_selector, '')
    
    # Insert right after the hidden inputs
    target_pos = html.find('<input type="hidden" id="debt-icon-type" value="zodiac_1.png">')
    if target_pos != -1:
        insert_idx = target_pos + len('<input type="hidden" id="debt-icon-type" value="zodiac_1.png">')
        html = html[:insert_idx] + "\n" + icon_selector + html[insert_idx:]

with open(app_js_path, 'w') as f:
    f.write(html)
print("Moved icon selector to top")
