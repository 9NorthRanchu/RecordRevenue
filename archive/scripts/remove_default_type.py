import re

html_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/index.html"
with open(html_path, 'r') as f:
    html = f.read()

# Remove the Default Type div from modal
pattern_modal = re.compile(r'\s*<div>\s*<label for="setting-default-type".*?</select>\s*</div>', re.DOTALL)
html = pattern_modal.sub('', html)

# Remove Default Type table header
html = html.replace('<th>Default Type</th>', '')

# Remove Default Type data cell in JS? Wait, the data cell is generated in JS. Let's not worry about JS yet, just HTML headers first.
with open(html_path, 'w') as f:
    f.write(html)

print("HTML fixed")
