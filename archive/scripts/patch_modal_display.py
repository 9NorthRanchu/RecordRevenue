html_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/index.html"
with open(html_path, 'r') as f:
    html = f.read()

target = 'id="debt-modal" class="modal-overlay" style="display: none; align-items: center; justify-content: center; z-index: 1000;"'
replacement = 'id="debt-modal" class="modal-overlay hidden" style="align-items: center; justify-content: center; z-index: 1000;"'

if target in html:
    html = html.replace(target, replacement)
    with open(html_path, 'w') as f:
        f.write(html)
    print("Patched display none to hidden!")
else:
    print("Could not find target string!")
