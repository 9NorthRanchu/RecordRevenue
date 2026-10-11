import re

# 1. Revert and fix app.js
app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

bad_render = """        <div onclick="selectIcon('${icon}')" style="cursor:pointer; border-radius: 12px; padding: 4px; border: 2px solid ${selectedIcon === icon ? '#3b82f6' : 'transparent'}; text-align: center; transition: all 0.2s; aspect-ratio: 1 / 1; display: flex; align-items: center; justify-content: center;">
            <img src="/assets/icons/${icon}" style="width: 100%; height: 100%; object-fit: contain; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        </div>"""

# Keep the aspect-ratio on the wrapper, but restore the img to its original state so box-shadow hugs the image
good_render = """        <div onclick="selectIcon('${icon}')" style="cursor:pointer; border-radius: 12px; padding: 4px; border: 2px solid ${selectedIcon === icon ? '#3b82f6' : 'transparent'}; text-align: center; transition: all 0.2s; aspect-ratio: 1 / 1; display: flex; align-items: center; justify-content: center;">
            <img src="/assets/icons/${icon}" style="width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        </div>"""

app = app.replace(bad_render, good_render)
with open(app_js_path, 'w') as f:
    f.write(app)
print("app.js updated")

# 2. Revert and fix style.css
style_css_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/style.css"
with open(style_css_path, 'r') as f:
    style = f.read()

bad_icon_grid = """.icon-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 6px;
    outline: none;
    padding-right: 2px;
    aspect-ratio: 2.8 / 1; /* Fixes height dynamically based on width to fit 2 rows */
    overflow: hidden;
    align-content: start;
}"""

good_icon_grid = """.icon-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 6px;
    outline: none;
    padding-right: 2px;
    min-height: 125px; /* Reserves space for 2 rows to prevent stuttering */
    max-height: 140px;
    overflow-y: auto;
}"""

style = style.replace(bad_icon_grid, good_icon_grid)
with open(style_css_path, 'w') as f:
    f.write(style)
print("style.css updated")

# 3. Revert index.html Category Mapping
index_html_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/index.html"
with open(index_html_path, 'r') as f:
    index = f.read()

bad_category = """                        <div style="background: rgba(255,255,255,0.8); border-radius: 12px; padding: 10px; border: 1px solid rgba(226, 232, 240, 0.8); margin-top: 10px;">
                            <h4 style="margin: 0 0 8px 0; font-size: 0.8rem; font-weight: 600; color: #475569;"><i class="fa-solid fa-link"></i> Category Mapping</h4>"""

good_category = """                        <div>
                            <h4 style="margin: 0 0 6px 0; font-size: 0.8rem; font-weight: 600; color: #475569;"><i class="fa-solid fa-link"></i> Category Mapping</h4>"""

index = index.replace(bad_category, good_category)
with open(index_html_path, 'w') as f:
    f.write(index)
print("index.html updated")

