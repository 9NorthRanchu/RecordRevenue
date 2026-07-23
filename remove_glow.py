import re

html_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/index.html"
with open(html_path, 'r') as f:
    html = f.read()

# Replace the style attribute of debt-details-panel
old_style = 'style="display: none; padding: 20px; border-radius: 20px; background: linear-gradient(135deg, rgba(255,255,255,0.95), rgba(255,255,255,0.7)); backdrop-filter: blur(15px); box-shadow: 10px 10px 20px rgba(162, 210, 255, 0.2), -10px -10px 20px rgba(255,255,255,0.8); border: 1px solid rgba(255,255,255,0.9);"'
new_style = 'style="display: none; padding: 20px; border-radius: 20px; background: #ffffff; border: 1px solid #e2e8f0;"'

html = html.replace(old_style, new_style)

with open(html_path, 'w') as f:
    f.write(html)

print("HTML fixed shadow")
