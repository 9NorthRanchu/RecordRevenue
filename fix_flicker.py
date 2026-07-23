import re

# 1. Update app.js
app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

# We need to find the `function renderIconGrid() { ... }` block and replace it entirely.
old_render_grid = """function renderIconGrid() {
    const grid = document.getElementById('icon-grid');
    if (!grid) return;
    grid.innerHTML = ICON_SETS[currentIconTab].map(icon => `
        <div onclick="selectIcon('${icon}')" style="cursor:pointer; border-radius: 12px; padding: 4px; border: 2px solid ${selectedIcon === icon ? '#3b82f6' : 'transparent'}; text-align: center; transition: all 0.2s; aspect-ratio: 1 / 1; display: flex; align-items: center; justify-content: center;">
            <img src="/assets/icons/${icon}" style="width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        </div>
    `).join('');
}"""

new_render_grid = """let isIconGridInitialized = false;

function renderIconGrid() {
    const container = document.getElementById('icon-grid');
    if (!container) return;
    
    if (!isIconGridInitialized || !container.innerHTML.trim()) {
        container.innerHTML = Object.keys(ICON_SETS).map(tab => {
            return `
                <div id="grid-tab-${tab}" class="icon-tab-grid" style="display: ${tab === currentIconTab ? 'grid' : 'none'}; grid-template-columns: repeat(6, 1fr); gap: 6px; align-content: start;">
                    ${ICON_SETS[tab].map(icon => {
                        const iconId = icon.replace(/\\./g, '-');
                        return `
                            <div id="icon-wrapper-${iconId}" onclick="selectIcon('${icon}')" style="cursor:pointer; border-radius: 12px; padding: 4px; border: 2px solid ${selectedIcon === icon ? '#3b82f6' : 'transparent'}; text-align: center; transition: all 0.2s; aspect-ratio: 1 / 1; display: flex; align-items: center; justify-content: center;">
                                <img src="/assets/icons/${icon}" loading="lazy" style="width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }).join('');
        isIconGridInitialized = true;
    } else {
        Object.keys(ICON_SETS).forEach(tab => {
            const grid = document.getElementById(`grid-tab-${tab}`);
            if (grid) {
                grid.style.display = (tab === currentIconTab) ? 'grid' : 'none';
            }
        });
        
        Object.keys(ICON_SETS).forEach(tab => {
            ICON_SETS[tab].forEach(icon => {
                const iconId = icon.replace(/\\./g, '-');
                const wrapper = document.getElementById(`icon-wrapper-${iconId}`);
                if (wrapper) {
                    wrapper.style.border = (selectedIcon === icon) ? '2px solid #3b82f6' : '2px solid transparent';
                }
            });
        });
    }
}"""

if old_render_grid in app:
    app = app.replace(old_render_grid, new_render_grid)
    with open(app_js_path, 'w') as f:
        f.write(app)
    print("app.js updated successfully")
else:
    print("Could not find old_render_grid in app.js")

# 2. Update style.css
style_css_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/style.css"
with open(style_css_path, 'r') as f:
    style = f.read()

old_icon_grid = """.icon-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 6px;
    outline: none;
    padding-right: 2px;
    min-height: 125px; /* Reserves space for 2 rows to prevent stuttering */
    max-height: 140px;
    overflow-y: auto;
}"""

# Remove grid, let it be a block container without scrollbars
new_icon_grid = """.icon-grid {
    display: block;
    outline: none;
    padding-right: 2px;
    min-height: 125px; /* Reserves space for 2 rows to prevent stuttering */
    overflow: hidden; /* No scrollbars ever */
}
/* Hide scrollbars on webkit just in case for icon-tabs */
.icon-tabs::-webkit-scrollbar {
    display: none;
}
"""

if old_icon_grid in style:
    style = style.replace(old_icon_grid, new_icon_grid)
    with open(style_css_path, 'w') as f:
        f.write(style)
    print("style.css updated successfully")
else:
    print("Could not find old_icon_grid in style.css")

