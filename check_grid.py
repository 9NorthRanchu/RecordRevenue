from PIL import Image

path = '/Users/DNorth/.gemini/antigravity/brain/c9d0ffa8-00c4-4a6f-9000-a486ecdcca8e/onepiece_grid_1783505510683.png'
im = Image.open(path)
w, h = im.size
print(f"Size: {w}x{h}")
cw, ch = w//4, h//4

# Check pixels exactly at the border between cell 0,0 and 1,0
border_pixels = []
for y in range(10, ch-10):
    border_pixels.append(im.getpixel((cw, y)))
    border_pixels.append(im.getpixel((cw-1, y)))
    border_pixels.append(im.getpixel((cw+1, y)))

# Count how many are white
white_count = sum(1 for p in border_pixels if p[0]>240 and p[1]>240 and p[2]>240)
print(f"White pixels at vertical border: {white_count} out of {len(border_pixels)}")

