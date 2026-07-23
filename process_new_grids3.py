from PIL import Image
import os

sprites = {
    'hokkaido': '/Users/DNorth/.gemini/antigravity/brain/c9d0ffa8-00c4-4a6f-9000-a486ecdcca8e/hokkaido_new_grid2_1783505487478.png',
    'mascot': '/Users/DNorth/.gemini/antigravity/brain/c9d0ffa8-00c4-4a6f-9000-a486ecdcca8e/hokkaido_mascot_grid_1783505497431.png',
    'onepiece': '/Users/DNorth/.gemini/antigravity/brain/c9d0ffa8-00c4-4a6f-9000-a486ecdcca8e/onepiece_grid_1783505510683.png',
}

for prefix, sheet_path in sprites.items():
    if not os.path.exists(sheet_path):
        print(f"Missing {sheet_path}")
        continue
    sheet = Image.open(sheet_path)
    sw, sh = sheet.size
    
    cell_w = sw / 4.0
    cell_h = sh / 4.0
    
    margin = 0
    
    idx = 1
    for y in range(4):
        for x in range(4):
            left = int(x * cell_w)
            upper = int(y * cell_h)
            right = int((x + 1) * cell_w)
            lower = int((y + 1) * cell_h)
            
            cell = sheet.crop((left, upper, right, lower))
            
            path = f'frontend/assets/icons/{prefix}_{idx}.png'
            cell.save(path)
            print(f"Saved {path}")
            idx += 1
            if idx > 12: break
        if idx > 12: break

print("Done processing grids with no margin.")
