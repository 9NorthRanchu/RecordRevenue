html_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/index.html"
with open(html_path, 'r') as f:
    html = f.read()

# Replace <div class="form-group"> inside the modal with <div class="form-group" style="min-width: 0;">
# We'll just patch the specific grids in the new modal.
html = html.replace('<div class="form-group">', '<div class="form-group" style="min-width: 0;">')
html = html.replace('<div class="form-group" style="margin-bottom: 0;">', '<div class="form-group" style="margin-bottom: 0; min-width: 0;">')

with open(html_path, 'w') as f:
    f.write(html)
print("Patched min-width: 0!")
