app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

# I will append the event listener logic for the icon grid
nav_script = """

// Keydown navigation for icon grid
document.addEventListener('DOMContentLoaded', () => {
    const iconGrid = document.getElementById('icon-grid');
    if(iconGrid) {
        iconGrid.addEventListener('keydown', (e) => {
            const icons = ICON_SETS[currentIconTab];
            if(!icons || icons.length === 0) return;
            
            let currentIndex = icons.indexOf(selectedIcon);
            if(currentIndex === -1) currentIndex = 0;
            
            let newIndex = currentIndex;
            const columns = 4; // We set repeat(4, 1fr) in HTML
            const rows = Math.ceil(icons.length / columns);
            
            if (e.key === 'ArrowRight') {
                newIndex = (currentIndex + 1) % icons.length;
                e.preventDefault();
            } else if (e.key === 'ArrowLeft') {
                newIndex = (currentIndex - 1 + icons.length) % icons.length;
                e.preventDefault();
            } else if (e.key === 'ArrowDown') {
                newIndex = currentIndex + columns;
                if (newIndex >= icons.length) {
                    newIndex = newIndex % columns; // Wrap to top of same column
                    // If the wrapped index is still out of bounds (shouldn't happen if full row, but just in case)
                    if (newIndex >= icons.length) newIndex = icons.length - 1;
                }
                e.preventDefault();
            } else if (e.key === 'ArrowUp') {
                newIndex = currentIndex - columns;
                if (newIndex < 0) {
                    // Wrap to bottom of same column
                    newIndex = ((rows - 1) * columns) + currentIndex;
                    if (newIndex >= icons.length) newIndex -= columns;
                }
                e.preventDefault();
            }
            
            if (newIndex !== currentIndex && newIndex >= 0 && newIndex < icons.length) {
                selectIcon(icons[newIndex]);
                // Ensure the selected item is scrolled into view
                setTimeout(() => {
                    const selectedElem = iconGrid.querySelector(`div[onclick="selectIcon('${icons[newIndex]}')"]`);
                    if(selectedElem) {
                        selectedElem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                }, 50);
            }
        });
    }
});
"""

if "Keydown navigation for icon grid" not in app:
    with open(app_js_path, 'a') as f:
        f.write(nav_script)
    print("Added keyboard navigation!")
else:
    print("Navigation already exists.")

