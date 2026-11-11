"""Turn the CC0 packs from OpenGameArt into the engine's textures.

Usage:  pip install pillow
        python tools/import_opengameart.py

Reads assets-src/opengameart/ (see the License.txt in each folder) and writes
public/textures/*.png at 2x with nearest neighbour, like the Kenney textures:

- Puny Characters (Shade, CC0): 32 x 32 frames; frame 0 is the soldier facing
  down. Its empty margin is trimmed so the sprite sits on its feet.
- 16x16 Explosion (BitingChaos, CC0): five frames, explosion-1.png to explosion-5.png.
- Tiny gun icons (congusbongus and others, CC0): the firearms the hero can pick up.
- CC0 Explosive Icons (Chrisblue): the hand grenade, already drawn at 32 px.
"""
import pathlib

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets-src" / "opengameart"
OUT = ROOT / "public" / "textures"
SCALE = 2
FRAME = 32

# texture name -> sheet of Puny Characters (frame 0: idle, facing down)
PUNY = {
    "legionary": "Soldier-Red.png",
    "guard": "Soldier-Blue.png",
    "captain": "Warrior-Red.png",
}

# texture name -> icon of Tiny gun icons (16 px, pointing right)
GUNS = {
    "pistol": "desert_hawk.png",
    "rifle": "poshlinov.png",
    "shotgun": "sg1.png",
    "smg": "m500.png",
    "sniper": "snp6plus.png",
    "launcher": "x90.png",
}


def scaled(image: Image.Image) -> Image.Image:
    return image.resize((image.width * SCALE, image.height * SCALE), Image.NEAREST)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, sheet in PUNY.items():
        frame = Image.open(SOURCE / "puny-characters" / sheet).convert("RGBA").crop((0, 0, FRAME, FRAME))
        frame = frame.crop(frame.getbbox())
        scaled(frame).save(OUT / f"{name}.png")
        print(f"textures/{name}.png")
    for name, icon in GUNS.items():
        image = Image.open(SOURCE / "tiny-guns" / icon).convert("RGBA")
        scaled(image.crop(image.getbbox())).save(OUT / f"{name}.png")
        print(f"textures/{name}.png")
    # The grenade is the first 32 x 32 icon of the sheet: no scaling needed.
    bomb = Image.open(SOURCE / "explosives" / "explosive-chrisblue.png").convert("RGBA").crop((0, 0, 32, 32))
    bomb.crop(bomb.getbbox()).save(OUT / "grenade.png")
    print("textures/grenade.png")
    for n in range(1, 6):
        image = Image.open(SOURCE / "explosion-16" / f"explosion-0{n}.png").convert("RGBA")
        scaled(image).save(OUT / f"explosion-{n}.png")
        print(f"textures/explosion-{n}.png")


if __name__ == "__main__":
    main()
