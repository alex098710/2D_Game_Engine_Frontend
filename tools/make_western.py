"""Draw the Western town: saloon, cabin, wagon with hay, hay bale, crates,
water trough, cactus, street lamp, boardwalk and dirt tiles, and the bandit.

Usage:  python tools/make_western.py
Writes public/textures/<name>.png. Original pixel art, drawn here in code (no
image library). Each sprite is drawn on a small grid and scaled 2x like the
rest of the textures, lit from the top left, with a dark outline so it reads
on any ground. Colours come from one warm palette shared by every sprite.
"""
import pathlib
import random
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from make_textures import OUT, rgba, write_png  # noqa: E402

CLEAR = (0, 0, 0, 0)

# One warm palette for the whole town (dark -> light per material).
P = {
    "outline": "2a1a10",
    "wood0": "3f2616", "wood1": "5e3a20", "wood2": "84542e", "wood3": "a8703f", "wood4": "c99258",
    "roof0": "4a2a1c", "roof1": "6e3a26", "roof2": "8f4f30", "roof3": "b06a3e",
    "cream": "efe2c2", "cream2": "d6c49c", "ink": "3a2214",
    "glass0": "1f2c3a", "glass1": "33506a", "glass2": "7fa6c4",
    "curtain": "a8323a",
    "hay0": "a07a22", "hay1": "c9a23c", "hay2": "e3c25a", "hay3": "f4dd88",
    "twine": "9a3a2a",
    "dirt0": "a8834e", "dirt1": "bf9a60", "dirt2": "cfab70", "dirt3": "dfc088",
    "metal0": "2c3036", "metal1": "4b5059", "metal2": "7a818c", "metal3": "aab2bd",
    "light": "ffd36a", "light2": "fff1b8",
    "water0": "2d5f8a", "water1": "3f7fb0", "water2": "8cc6ea",
    "cactus0": "1f4d2b", "cactus1": "2f6f3b", "cactus2": "45934f", "cactus3": "6cbf6e",
    "flower": "e05a8a",
    "skin": "e0a477", "skin2": "b97a50",
    "cloth0": "3b2a22", "cloth1": "5e4130", "cloth2": "7d5a40",
    "bandana": "b8343a", "hat0": "2a1d16", "hat1": "4a3326",
    "steel": "c9ced6", "boot": "241812",
}


class Canvas:
    """A tiny pixel canvas: draw at 1x, written 2x."""

    def __init__(self, width: int, height: int, seed: int = 7):
        self.w, self.h = width, height
        self.px = [[CLEAR] * width for _ in range(height)]
        self.rng = random.Random(seed)

    def set(self, x: int, y: int, colour: str) -> None:
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = rgba(P.get(colour, colour))

    def rect(self, x: int, y: int, w: int, h: int, colour: str) -> None:
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.set(xx, yy, colour)

    def hline(self, x: int, y: int, w: int, colour: str) -> None:
        self.rect(x, y, w, 1, colour)

    def vline(self, x: int, y: int, h: int, colour: str) -> None:
        self.rect(x, y, 1, h, colour)

    def grain(self, x: int, y: int, w: int, h: int, colours: list, chance: float = 0.12) -> None:
        """Speckle a rectangle with a few shades (wood grain, straw, dirt)."""
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                if self.rng.random() < chance:
                    self.set(xx, yy, self.rng.choice(colours))

    def outline(self, colour: str = "outline") -> None:
        """A 1 px dark edge around everything drawn, so the sprite reads on any ground."""
        solid = [[p[3] > 0 for p in row] for row in self.px]
        for y in range(self.h):
            for x in range(self.w):
                if solid[y][x]:
                    continue
                if any(0 <= x + dx < self.w and 0 <= y + dy < self.h and solid[y + dy][x + dx]
                       for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    self.set(x, y, colour)

    def save(self, name: str) -> None:
        write_png(OUT / f"{name}.png", self.px)


# 3 x 5 letters for signs.
FONT = {
    "S": ["111", "100", "111", "001", "111"],
    "A": ["010", "101", "111", "101", "101"],
    "L": ["100", "100", "100", "100", "111"],
    "O": ["111", "101", "101", "101", "111"],
    "N": ["101", "111", "111", "111", "101"],
}


def text(c: Canvas, x: int, y: int, word: str, colour: str) -> None:
    for i, letter in enumerate(word):
        for row, bits in enumerate(FONT[letter]):
            for col, bit in enumerate(bits):
                if bit == "1":
                    c.set(x + i * 4 + col, y + row, colour)


def planks_h(c: Canvas, x: int, y: int, w: int, h: int, shades: tuple, step: int = 3) -> None:
    """Horizontal boards: alternating shades, a dark seam under each board, grain."""
    dark, mid, light = shades
    for i, yy in enumerate(range(y, y + h, step)):
        c.rect(x, yy, w, min(step, y + h - yy), mid if i % 2 else light)
        c.hline(x, min(yy + step - 1, y + h - 1), w, dark)
    c.grain(x, y, w, h, [dark, mid], 0.06)


def window(c: Canvas, x: int, y: int, w: int, h: int, curtains: bool = True) -> None:
    c.rect(x - 1, y - 1, w + 2, h + 2, "wood0")
    c.rect(x, y, w, h, "glass1")
    c.rect(x, y + h // 2, w, h - h // 2, "glass0")
    for i in range(min(w, h) - 1):  # a glint across the glass
        c.set(x + 1 + i, y + h - 2 - i, "glass2")
    c.vline(x + w // 2, y, h, "wood1")
    c.hline(x, y + h // 2, w, "wood1")
    if curtains:
        c.rect(x, y, 2, h - 2, "curtain")
        c.rect(x + w - 2, y, 2, h - 2, "curtain")
    c.hline(x - 1, y + h + 1, w + 2, "wood3")  # sill


def saloon() -> Canvas:
    c = Canvas(80, 64, seed=11)
    # Upper floor and the false front.
    planks_h(c, 4, 4, 72, 26, ("wood1", "wood2", "wood3"))
    c.rect(2, 0, 76, 4, "wood1")
    c.hline(2, 0, 76, "wood3")
    c.rect(0, 2, 4, 6, "wood1")
    c.rect(76, 2, 4, 6, "wood1")
    # The sign.
    c.rect(22, 5, 36, 10, "ink")
    c.rect(23, 6, 34, 8, "cream")
    c.hline(23, 13, 34, "cream2")
    text(c, 28, 7, "SALOON", "ink")
    # Upper windows.
    for x in (9, 34, 59):
        window(c, x, 17, 12, 9)
    # Porch roof: a sloped tin roof in the shade.
    for x in range(0, 80):
        shade = "roof2" if x % 4 < 2 else "roof1"
        c.vline(x, 30, 7, shade)
    c.hline(0, 30, 80, "roof3")
    c.hline(0, 37, 80, "roof0")
    # Ground floor in the porch's shadow.
    planks_h(c, 4, 38, 72, 18, ("wood0", "wood1", "wood2"))
    for x in (3, 25, 54, 76):  # posts
        c.rect(x, 38, 2, 18, "wood3")
        c.vline(x + 1, 38, 18, "wood1")
    # Swinging doors.
    c.rect(34, 40, 12, 16, "glass0")
    for x in (34, 40):
        c.rect(x, 43, 6, 9, "wood3")
        for yy in range(44, 51, 2):
            c.hline(x + 1, yy, 4, "wood1")
    c.vline(39, 43, 9, "glass0")
    c.vline(40, 43, 9, "glass0")
    # Lower windows and two lamps by the door.
    window(c, 9, 41, 12, 8, curtains=False)
    window(c, 59, 41, 12, 8, curtains=False)
    for x in (30, 49):
        c.rect(x, 41, 2, 3, "light")
        c.set(x, 41, "light2")
    # The boardwalk.
    for x in range(0, 80):
        c.vline(x, 56, 8, "wood3" if (x // 8) % 2 else "wood4")
    for x in range(0, 80, 8):
        c.vline(x, 56, 8, "wood1")
    c.grain(0, 56, 80, 8, ["wood2", "wood3"], 0.08)
    c.hline(0, 63, 80, "wood1")
    c.outline()
    return c


def cabin() -> Canvas:
    c = Canvas(48, 48, seed=3)
    # Roof: rows of shingles, lighter at the ridge, the eaves cast a shadow.
    c.rect(1, 0, 46, 22, "roof1")
    for y in range(1, 21, 3):
        c.hline(1, y + 2, 46, "roof0")
        for x in range(1 + (y % 2) * 3, 47, 6):
            c.vline(x, y, 3, "roof0")
    c.hline(1, 0, 46, "roof3")
    c.hline(1, 1, 46, "roof2")
    c.grain(1, 2, 46, 18, ["roof2", "roof0"], 0.05)
    c.hline(1, 21, 46, "roof0")
    # Stone chimney.
    c.rect(34, 0, 6, 8, "metal1")
    c.grain(34, 0, 6, 8, ["metal2", "metal0"], 0.4)
    c.hline(34, 0, 6, "metal3")
    # Log walls.
    for i, y in enumerate(range(22, 42, 4)):
        c.rect(3, y, 42, 4, "wood2" if i % 2 else "wood3")
        c.hline(3, y, 42, "wood4")
        c.hline(3, y + 3, 42, "wood1")
        c.set(3, y + 1, "wood1")
        c.set(44, y + 1, "wood1")
    # Door and windows.
    c.rect(19, 27, 10, 15, "wood0")
    c.rect(20, 28, 8, 14, "wood1")
    for yy in range(30, 41, 3):
        c.hline(20, yy, 8, "wood0")
    c.set(26, 35, "light")
    window(c, 7, 28, 8, 6, curtains=False)
    window(c, 33, 28, 8, 6, curtains=False)
    # A step in front of the door.
    c.rect(17, 42, 14, 3, "wood3")
    c.hline(17, 44, 14, "wood1")
    c.outline()
    return c


def wheel(c: Canvas, cx: int, cy: int) -> None:
    for y in range(-4, 5):
        for x in range(-4, 5):
            d = x * x + y * y
            if 12 <= d <= 20:
                c.set(cx + x, cy + y, "wood0")
            elif d < 12 and (x == 0 or y == 0 or abs(x) == abs(y)):
                c.set(cx + x, cy + y, "wood2")
    c.set(cx, cy, "metal2")
    c.set(cx - 2, cy - 3, "wood3")  # rim highlight


def wagon() -> Canvas:
    c = Canvas(32, 24, seed=5)
    # Hay piled on the bed, rounded on top.
    for y in range(0, 10):
        half = min(13, 6 + y * 2)
        c.hline(16 - half, y, half * 2, "hay2" if y < 4 else "hay1")
    c.grain(3, 0, 26, 10, ["hay3", "hay0", "hay1"], 0.35)
    # The bed.
    c.rect(2, 8, 28, 7, "wood2")
    c.hline(2, 8, 28, "wood4")
    c.hline(2, 11, 28, "wood1")
    c.hline(2, 14, 28, "wood0")
    for x in (2, 15, 29):
        c.vline(x, 8, 7, "wood1")
    # The shaft and the wheels.
    c.rect(0, 13, 3, 1, "wood1")
    wheel(c, 8, 18)
    wheel(c, 23, 18)
    c.outline()
    return c


def hay() -> Canvas:
    c = Canvas(16, 16, seed=9)
    c.rect(1, 3, 14, 12, "hay1")
    c.rect(1, 3, 14, 3, "hay2")
    c.hline(1, 3, 14, "hay3")
    c.grain(1, 3, 14, 12, ["hay3", "hay0", "hay2"], 0.3)
    for x in (4, 11):  # twine
        c.vline(x, 3, 12, "twine")
    c.hline(1, 14, 14, "hay0")
    c.set(0, 2, "hay2")
    c.set(15, 4, "hay3")
    c.outline()
    return c


def crate(c: Canvas, x: int, y: int, size: int) -> None:
    c.rect(x, y, size, size, "wood3")
    c.rect(x + 2, y + 2, size - 4, size - 4, "wood2")
    for i in range(size - 4):  # the cross brace
        c.set(x + 2 + i, y + 2 + i, "wood4")
        c.set(x + size - 3 - i, y + 2 + i, "wood1")
    c.hline(x, y, size, "wood4")
    c.hline(x, y + size - 1, size, "wood1")
    c.vline(x + size - 1, y, size, "wood1")


def crates() -> Canvas:
    c = Canvas(32, 24, seed=4)
    crate(c, 0, 10, 14)
    crate(c, 15, 10, 14)
    crate(c, 7, 0, 12)
    c.outline()
    return c


def trough() -> Canvas:
    c = Canvas(32, 16, seed=8)
    c.rect(1, 2, 30, 10, "wood2")
    c.rect(3, 3, 26, 4, "water1")
    c.hline(3, 3, 26, "water2")
    c.hline(3, 6, 26, "water0")
    for x in (6, 15, 22):
        c.set(x, 4, "water2")
    c.hline(1, 2, 30, "wood4")
    c.hline(1, 8, 30, "wood1")
    c.hline(1, 11, 30, "wood0")
    for x in (2, 27):  # legs
        c.rect(x, 12, 3, 3, "wood1")
    c.outline()
    return c


def cactus() -> Canvas:
    c = Canvas(16, 24, seed=6)

    def column(x, y, h):
        c.rect(x, y, 4, h, "cactus2")
        c.vline(x, y, h, "cactus1")
        c.vline(x + 3, y, h, "cactus0")
        c.vline(x + 1, y, h, "cactus3")
        c.hline(x + 1, y, 2, "cactus3")

    column(6, 2, 22)
    column(1, 8, 7)
    c.rect(4, 13, 3, 3, "cactus2")
    c.hline(4, 15, 3, "cactus0")
    column(11, 5, 7)
    c.rect(9, 10, 3, 3, "cactus2")
    c.hline(9, 12, 3, "cactus0")
    for y in range(4, 23, 4):  # spines
        c.set(5, y, "cream")
        c.set(10, y + 2, "cream")
    c.rect(7, 1, 2, 2, "flower")
    c.outline("cactus0")
    return c


def lamp() -> Canvas:
    c = Canvas(16, 32, seed=2)
    c.rect(7, 9, 2, 20, "metal1")
    c.vline(7, 9, 20, "metal2")
    c.rect(5, 28, 6, 3, "metal0")
    c.hline(5, 28, 6, "metal2")
    # The lantern and its light.
    c.rect(4, 0, 8, 2, "metal0")
    c.rect(5, 2, 6, 6, "light")
    c.rect(6, 3, 4, 3, "light2")
    c.vline(4, 2, 6, "metal1")
    c.vline(11, 2, 6, "metal1")
    c.rect(5, 8, 6, 1, "metal0")
    c.outline("metal0")
    return c


def boardwalk() -> Canvas:
    c = Canvas(16, 16, seed=12)
    for i, y in enumerate(range(0, 16, 4)):
        c.rect(0, y, 16, 4, "wood3" if i % 2 else "wood4")
        c.hline(0, y + 3, 16, "wood1")
        c.set(1 + (i * 5) % 14, y + 1, "wood0")  # a nail
    c.grain(0, 0, 16, 16, ["wood2", "wood3"], 0.08)
    return c


def dirt() -> Canvas:
    c = Canvas(16, 16, seed=13)
    c.rect(0, 0, 16, 16, "dirt2")
    c.grain(0, 0, 16, 16, ["dirt1", "dirt3", "dirt0"], 0.22)
    for x, y in ((3, 4), (11, 10), (7, 13)):  # pebbles
        c.set(x, y, "dirt0")
        c.set(x + 1, y, "dirt3")
    return c


def bandit() -> Canvas:
    c = Canvas(16, 16, seed=1)
    # Wide-brimmed hat.
    c.rect(4, 1, 8, 3, "hat1")
    c.hline(5, 1, 6, "hat0")
    c.rect(2, 4, 12, 1, "hat0")
    c.hline(5, 3, 6, "twine")
    # Face with a red bandana over the mouth.
    c.rect(5, 5, 6, 3, "skin")
    c.set(6, 6, "ink")
    c.set(9, 6, "ink")
    c.rect(5, 7, 6, 2, "bandana")
    # Long coat, belt and boots.
    c.rect(4, 9, 8, 4, "cloth1")
    c.vline(4, 9, 4, "cloth0")
    c.vline(7, 9, 4, "cloth2")
    c.hline(4, 11, 8, "cloth0")
    c.set(8, 11, "light")
    c.rect(5, 13, 2, 2, "boot")
    c.rect(9, 13, 2, 2, "boot")
    # Revolver in the right hand.
    c.rect(12, 10, 3, 1, "steel")
    c.set(12, 11, "metal1")
    c.set(11, 10, "skin2")
    c.outline()
    return c


SPRITES = {
    "saloon": saloon, "cabin": cabin, "wagon": wagon, "hay": hay, "crates": crates, "trough": trough,
    "cactus": cactus, "lamp": lamp, "boardwalk": boardwalk, "dirt": dirt, "bandit": bandit,
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, draw in SPRITES.items():
        draw().save(name)
        print(f"wrote {name}.png")


if __name__ == "__main__":
    main()
