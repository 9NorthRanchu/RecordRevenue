import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

app = app.replace('det.caption_id == d.principal_category_id', 'det.category_id == d.principal_category_id')
app = app.replace('det.caption_id == d.interest_category_id', 'det.category_id == d.interest_category_id')

with open(app_js_path, 'w') as f:
    f.write(app)
print("Category match fixed")
