from PIL import Image

im = Image.open('frontend/assets/icons/japan_2.png').convert("RGB")
w, h = im.size
row = [im.getpixel((x, h//2)) for x in range(20)]
print("Left 20 pixels of middle row:")
for i, p in enumerate(row):
    print(f"x={i}: {p}")
