from PIL import Image, ImageDraw

S = 1024
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

MINT = (63, 191, 154, 255)
WHITE = (255, 255, 255, 255)
PINK = (255, 158, 181, 255)
DARK = (57, 70, 63, 217)

# 背景圆角方块
d.rounded_rectangle([0, 0, S, S], radius=int(S * 0.22), fill=MINT)

# 耳朵（白色三角）
d.polygon([(592, 364), (676, 296), (688, 380)], fill=WHITE)

# 身体
d.ellipse([212, 344, 836, 840], fill=WHITE)

# 鼻子
d.ellipse([176, 528, 376, 704], fill=WHITE)
d.ellipse([240, 600, 280, 640], fill=MINT)
d.ellipse([304, 600, 344, 640], fill=MINT)

# 投币口
d.rounded_rectangle([464, 352, 592, 392], radius=15, fill=PINK)

# 腿
d.rounded_rectangle([396, 800, 468, 912], radius=34, fill=WHITE)
d.rounded_rectangle([584, 800, 656, 912], radius=34, fill=WHITE)

# 尾巴（白色粗弧）
d.arc([812, 560, 916, 700], start=20, end=200, fill=WHITE, width=30)

# 眼睛
d.ellipse([276, 528, 320, 572], fill=DARK)

img.save("frontend/icon.png")
print("icon.png written:", img.size)
