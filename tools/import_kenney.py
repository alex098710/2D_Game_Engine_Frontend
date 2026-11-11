"""Turn the Kenney "Tiny Dungeon", "Tiny Town" and "Tiny Battle" packs into the engine's textures.

Usage:  pip install pillow
        python tools/import_kenney.py

Reads the original sheets in assets-src/kenney/ (CC0, see the License.txt files)
and writes public/textures/*.png. Every 16 px tile is scaled 2x with nearest
neighbour, so it stays crisp on the 32 px grid of the engine.
"""
import pathlib

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets-src" / "kenney"
OUT = ROOT / "public" / "textures"
TILE = 16
SCALE = 2

DUNGEON = "tiny-dungeon"
TOWN = "tiny-town"
BATTLE = "tiny-battle"
# Tiles per row of each packed sheet.
COLUMNS = {DUNGEON: 12, TOWN: 12, BATTLE: 18}

# texture name -> (pack, tile index). Indexes follow the sheets, left to right, top to bottom.
SINGLE_TILES = {
    # player characters (one per hero class) and the generic player icon
    "player": (DUNGEON, 85),
    "hero-knight": (DUNGEON, 96),
    "hero-wizard": (DUNGEON, 84),
    "hero-archer": (DUNGEON, 112),
    "hero-barbarian": (DUNGEON, 88),
    "hero-rogue": (DUNGEON, 98),
    "hero-viking": (DUNGEON, 87),
    "hero-lancer": (DUNGEON, 86),
    "hero-druid": (DUNGEON, 100),
    # friendly 2D characters
    "villager": (DUNGEON, 99),
    "knight": (DUNGEON, 97),
    "wizard": (DUNGEON, 111),
    # enemies
    "enemy-slime": (DUNGEON, 108),
    "bat": (DUNGEON, 120),
    "spider": (DUNGEON, 122),
    "ghost": (DUNGEON, 121),
    "brute": (DUNGEON, 109),
    "demon": (DUNGEON, 110),
    "mimic": (DUNGEON, 92),
    "rat": (DUNGEON, 123),
    # obstacles and buildings
    "wall": (DUNGEON, 40),
    "box": (DUNGEON, 63),
    "barrel": (DUNGEON, 82),
    "tree": (TOWN, 16),
    "bush": (TOWN, 5),
    "fence": (TOWN, 45),
    # items
    "coin": (TOWN, 93),
    "chest": (DUNGEON, 89),
    "chest-open": (DUNGEON, 91),
    "potion": (DUNGEON, 115),
    "sword": (DUNGEON, 104),
    "axe": (DUNGEON, 118),
    "wand": (DUNGEON, 130),
    "bow": (TOWN, 118),
    # weapons only heroes carry (named after the weapon, like the ones above)
    "dagger": (DUNGEON, 103),
    "hammer": (DUNGEON, 117),
    "spear": (DUNGEON, 131),
    "staff": (DUNGEON, 129),
    # war (Tiny Battle): the red army is the enemy, the blue army is on your side
    "soldier": (BATTLE, 160),
    "grenadier": (BATTLE, 161),
    "tank": (BATTLE, 152),
    "artillery": (BATTLE, 153),
    "ally": (BATTLE, 142),
    "barricade": (BATTLE, 25),
    "hedgehog": (BATTLE, 23),
    "bunker": (BATTLE, 9),
    "tower": (BATTLE, 13),
    "flag": (BATTLE, 52),
    "banner": (BATTLE, 70),
    "rock": (BATTLE, 5),
    "road": (BATTLE, 130),
    "medkit": (BATTLE, 195),
    "jeep-blue": (BATTLE, 131),
    "tank-blue": (BATTLE, 134),
    "plane-blue": (BATTLE, 136),
    "plane-red": (BATTLE, 154),
    # ground
    "grass": (TOWN, 0),
    "path": (TOWN, 109),  # light stone: reads as a street, a square or a stone path
}

# Enemies made by repainting a character: (pack, tile index, gradient from dark to light).
# Every pixel except the outline takes the colour of the gradient at its brightness.
RECOLORED = {
    "marksman": (DUNGEON, 112, ["2a1d3d", "5b3f7a", "9b86b8", "e9e4d8"]),     # dark archer: purple and bone
    "necromancer": (DUNGEON, 84, ["10241a", "1f5a3a", "54b37c", "d8f5c4"]),  # necromancer: sickly green
    "explosive": (DUNGEON, 82, ["3a0d0d", "a3201c", "e8452c", "ffd166"]),     # red powder keg: it blows up
}

# Buildings made of several tiles: rows of (pack, tile index).
COMPOSITES = {
    "house": [
        [(TOWN, 52), (TOWN, 53), (TOWN, 54)],
        [(TOWN, 64), (TOWN, 65), (TOWN, 66)],
        [(TOWN, 84), (TOWN, 85), (TOWN, 84)],
    ],
}


def load_sheets() -> dict:
    return {pack: Image.open(SOURCE / pack / "tilemap_packed.png").convert("RGBA") for pack in COLUMNS}


def tile(sheets: dict, pack: str, index: int) -> Image.Image:
    column, row = index % COLUMNS[pack], index // COLUMNS[pack]
    return sheets[pack].crop((column * TILE, row * TILE, (column + 1) * TILE, (row + 1) * TILE))


def scaled(image: Image.Image) -> Image.Image:
    return image.resize((image.width * SCALE, image.height * SCALE), Image.NEAREST)


def composite(sheets: dict, rows: list) -> Image.Image:
    image = Image.new("RGBA", (len(rows[0]) * TILE, len(rows) * TILE), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, (pack, index) in enumerate(row):
            image.alpha_composite(tile(sheets, pack, index), (x * TILE, y * TILE))
    return image


def gradient(colors: list, t: float) -> tuple:
    rgb = [tuple(int(c[i:i + 2], 16) for i in (0, 2, 4)) for c in colors]
    t = max(0.0, min(1.0, t)) * (len(rgb) - 1)
    i = min(int(t), len(rgb) - 2)
    f = t - i
    return tuple(round(rgb[i][k] + (rgb[i + 1][k] - rgb[i][k]) * f) for k in range(3))


def recolor(image: Image.Image, colors: list) -> Image.Image:
    out = image.copy()
    pixels = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            light = (0.299 * r + 0.587 * g + 0.114 * b) / 255
            if light < 0.2:
                continue  # keep the dark outline
            pixels[x, y] = gradient(colors, (light - 0.2) / 0.8) + (a,)
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    sheets = load_sheets()
    for name, (pack, index) in SINGLE_TILES.items():
        scaled(tile(sheets, pack, index)).save(OUT / f"{name}.png")
        print(f"textures/{name}.png")
    for name, (pack, index, colors) in RECOLORED.items():
        scaled(recolor(tile(sheets, pack, index), colors)).save(OUT / f"{name}.png")
        print(f"textures/{name}.png")
    for name, rows in COMPOSITES.items():
        scaled(composite(sheets, rows)).save(OUT / f"{name}.png")
        print(f"textures/{name}.png")


if __name__ == "__main__":
    main()
