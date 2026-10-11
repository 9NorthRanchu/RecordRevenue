import re
app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

plus_btns = re.findall(r'<i class="fa-solid fa-plus.*?</i>', app)
print("Plus buttons:", set(plus_btns))
