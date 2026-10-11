import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

app = app.replace('getUserId()', 'encodeURIComponent(AppState.userId)')

with open(app_js_path, 'w') as f:
    f.write(app)
print("getUserId fixed")
