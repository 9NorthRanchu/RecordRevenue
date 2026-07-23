import re

style_css_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/style.css"
with open(style_css_path, 'r') as f:
    style = f.read()

old_icon_grid = """.icon-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 6px;
    outline: none;
    padding-right: 2px;
    height: 110px; /* Fixed height to prevent layout shift */
    overflow-y: auto;
    align-content: start;
}"""

new_icon_grid = """.icon-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 6px;
    outline: none;
    padding-right: 2px;
    aspect-ratio: 2.8 / 1; /* Fixes height dynamically based on width to fit 2 rows */
    overflow: hidden;
    align-content: start;
}"""

style = style.replace(old_icon_grid, new_icon_grid)

with open(style_css_path, 'w') as f:
    f.write(style)
print("style.css grid updated")

