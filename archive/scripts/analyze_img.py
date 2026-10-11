from PIL import Image

im = Image.open('frontend/assets/icons/japan_1.png').convert("RGB")
w, h = im.size
print(f"Size: {w}x{h}")
# print middle row pixels
row = [im.getpixel((x, h//2)) for x in range(w)]
print("Middle row RGB values:")
for i, p in enumerate(row):
    if p != (255, 255, 255):
        print(f"x={i}: {p}")
