import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

old_categories = """const categories = {
            'Zodiac': Array.from({length: 12}, (_, i) => `zodiac_${i+1}.png`),
            'Hokkaido': Array.from({length: 12}, (_, i) => `hokkaido_${i+1}.png`),
            'China': Array.from({length: 12}, (_, i) => `china_${i+1}.png`),
            'Japan': Array.from({length: 12}, (_, i) => `japan_${i+1}.png`),
        };"""

new_categories = """const categories = {
            'Zodiac': Array.from({length: 12}, (_, i) => `zodiac_${i+1}.png`),
            'Hokkaido': Array.from({length: 12}, (_, i) => `hokkaido_${i+1}.png`),
            'China': Array.from({length: 12}, (_, i) => `china_${i+1}.png`),
            'Japan': Array.from({length: 12}, (_, i) => `japan_${i+1}.png`),
            'Mascot': Array.from({length: 12}, (_, i) => `mascot_${i+1}.png`),
            'One Piece': Array.from({length: 12}, (_, i) => `onepiece_${i+1}.png`),
        };"""

if old_categories in app:
    app = app.replace(old_categories, new_categories)
    with open(app_js_path, 'w') as f:
        f.write(app)
    print("Patched categories!")
else:
    print("Could not find categories block!")

