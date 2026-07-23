from PIL import Image

im = Image.open('frontend/assets/icons/japan_2.png').convert("RGB")
w, h = im.size
print(f"Mt Fuji Size: {w}x{h}")
print(f"Left edge pixel: {im.getpixel((0, h//2))}")
print(f"Right edge pixel: {im.getpixel((w-1, h//2))}")
print(f"Top edge pixel: {im.getpixel((w//2, 0))}")
print(f"Bottom edge pixel: {im.getpixel((w//2, h-1))}")

