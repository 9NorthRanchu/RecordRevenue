app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

# Remove all occurrences
import re
icon_pattern = re.compile(r"// Icon Selector Logic.*?function selectIcon\(icon\) \{.*?\}", re.DOTALL)
matches = icon_pattern.findall(app)
if matches:
    # Remove all
    app = icon_pattern.sub('', app)
    # Insert just once at the top
    app = matches[0] + "\n\n" + app

with open(app_js_path, 'w') as f:
    f.write(app)
