import Phaser from "phaser";
import { isCharacter, isEnemy, isGround, SIZES, WORLD_HEIGHT, WORLD_WIDTH, type GameObject, type Kind } from "../model/GameObject";
import { clampToWorld, containZoom, fitZoom, snap, viewMargins } from "../model/geometry";
import type { SceneModel } from "../model/SceneModel";
import { variantTint } from "./balance";
import { bob, KIND_TEXTURE, loadTextures } from "./textures";

export interface EditorOptions {
  showGrid: boolean;
  snapToGrid: boolean;
  gridSize: number;
}

/** The editing tools, like in any 2D engine. */
export type Tool = "select" | "hand" | "brush" | "erase";

export interface EditorEvents {
  onSelect: (id: string | null) => void;
  onPlace: (kind: Kind, x: number, y: number) => void;
  onErase: (id: string) => void;
  onPointer: (x: number, y: number) => void;
  onZoom: (zoom: number) => void;
  /** Where the world is drawn on the canvas, in screen pixels (for the frame around it). */
  onView?: (left: number, top: number, width: number, height: number) => void;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const ERASE_TINT = 0xff6b6b;
const HOVER_TINT = 0xc8d6ff;

/**
 * Phaser scene that DRAWS the model and lets the user edit it.
 * All the data lives in SceneModel; this class never keeps its own copy.
 */
export class EditorScene extends Phaser.Scene {
  private readonly model: SceneModel;
  private readonly events_: EditorEvents;
  private options: EditorOptions = { showGrid: true, snapToGrid: true, gridSize: 32 };
  private drawnVersion = -1;
  private grid!: Phaser.GameObjects.Graphics;
  private selection!: Phaser.GameObjects.Graphics;
  private ghost: Phaser.GameObjects.Image | null = null;
  private placing: Kind | null = null;
  private tool: Tool = "select";
  private panning: { x: number; y: number; scrollX: number; scrollY: number } | null = null;

  /** Id of the selected object, or null. */
  selectedId: string | null = null;

  constructor(model: SceneModel, events: EditorEvents) {
    super("editor");
    this.model = model;
    this.events_ = events;
  }

  preload(): void {
    loadTextures(this);
  }

  create(): void {
    this.drawnVersion = -1; // the scene starts again when we come back from Play
    this.ghost = null;
    // Outside the map the terrain goes on, dim and dark, so the empty room around
    // the frame reads as the world continuing instead of black bands.
    this.add.tileSprite(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH * 5, WORLD_HEIGHT * 5, "grass")
      .setDepth(-12).setTint(0x6a8aa0).setAlpha(0.6);
    this.add.tileSprite(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, "grass").setDepth(-10);
    this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT).setStrokeStyle(4, 0x0b0f14, 0.9).setDepth(-5);
    this.grid = this.add.graphics().setDepth(-4);
    this.selection = this.add.graphics().setDepth(50);
    this.drawGrid();
    this.setupCamera();
    this.setupInput();
    this.setupPanAndZoom();
    this.setTool(this.tool, this.placing);
  }

  private setupCamera(): void {
    const camera = this.cameras.main;
    camera.setBackgroundColor("rgba(0,0,0,0)");
    this.fitView();
    // The scale manager belongs to the whole game: stop listening when this scene
    // shuts down, or a resize while playing would touch a camera that no longer exists.
    const onResize = () => this.fitView();
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, onResize));
  }

  /** Zoom so the whole world fills the free room as much as it can, nothing cut, and centre it there. */
  fitView(): void {
    const camera = this.cameras.main;
    const margins = viewMargins(this.scale.width);
    camera.setZoom(Phaser.Math.Clamp(containZoom(this.scale.width, this.scale.height, margins), 0.1, MAX_ZOOM));
    // Centre in the free room (the bottom band holds the label and the zoom).
    camera.centerOn(WORLD_WIDTH / 2, WORLD_HEIGHT / 2 + (margins.bottom - margins.top) / 2 / camera.zoom);
    this.drawGrid();
    this.events_.onZoom(camera.zoom);
  }

  /** Zoom out until the whole world is visible ("Ver todo el mundo"). */
  showWholeWorld(): void {
    const camera = this.cameras.main;
    camera.setZoom(Phaser.Math.Clamp(fitZoom(this.scale.width, this.scale.height), MIN_ZOOM, MAX_ZOOM));
    camera.centerOn(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    this.drawGrid();
    this.events_.onZoom(camera.zoom);
  }

  /** Change zoom by a factor, keeping the world point under the pointer still. */
  zoomBy(factor: number, screenX = this.scale.width / 2, screenY = this.scale.height / 2): void {
    const camera = this.cameras.main;
    const before = camera.getWorldPoint(screenX, screenY);
    camera.setZoom(Phaser.Math.Clamp(camera.zoom * factor, MIN_ZOOM, MAX_ZOOM));
    const after = camera.getWorldPoint(screenX, screenY);
    camera.scrollX += before.x - after.x;
    camera.scrollY += before.y - after.y;
    this.drawGrid();
    this.events_.onZoom(camera.zoom);
  }

  /** Centre the camera on an object (used by the scene list). */
  focusOn(id: string): void {
    const object = this.model.find(id);
    if (object === undefined) return;
    this.cameras.main.pan(object.x, object.y, 250, "Sine.easeInOut");
  }

  /** The world point under a position of the page (for objects dropped from the library). */
  worldPointAt(clientX: number, clientY: number): { x: number; y: number } | null {
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    const point = this.cameras.main.getWorldPoint(
      ((clientX - rect.left) * this.scale.width) / rect.width,
      ((clientY - rect.top) * this.scale.height) / rect.height,
    );
    return { x: point.x, y: point.y };
  }

  private setupInput(): void {
    this.input.mouse?.disableContextMenu();

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer, hit: Phaser.GameObjects.GameObject[]) => {
      // Right or middle button always pans; the hand tool pans with the left button too.
      if (pointer.rightButtonDown() || pointer.middleButtonDown() || this.tool === "hand") {
        const camera = this.cameras.main;
        this.panning = { x: pointer.x, y: pointer.y, scrollX: camera.scrollX, scrollY: camera.scrollY };
        if (this.tool === "hand") this.input.setDefaultCursor("grabbing");
        return;
      }
      const hitId = hit.length > 0 ? (hit[0].getData("objectId") as string) : null;
      if (this.tool === "brush" && this.placing !== null) {
        const [x, y] = this.snapPoint(pointer.worldX, pointer.worldY, this.placing);
        this.events_.onPlace(this.placing, x, y);
      } else if (this.tool === "erase") {
        if (hitId !== null) this.events_.onErase(hitId);
      } else {
        this.select(hitId);
      }
    });

    this.input.on("drag", (_p: Phaser.Input.Pointer, image: Phaser.GameObjects.Image, dragX: number, dragY: number) => {
      if (this.tool !== "select") return;
      const kind = image.getData("kind") as Kind;
      const [x, y] = this.snapPoint(dragX, dragY, kind);
      image.setPosition(x, y);
      this.drawSelection();
    });

    this.input.on("dragend", (_p: Phaser.Input.Pointer, image: Phaser.GameObjects.Image) => {
      const object = this.model.find(image.getData("objectId") as string);
      if (object !== undefined && (object.x !== image.x || object.y !== image.y)) {
        this.model.move(object.id, image.x, image.y);
      }
    });

    // Hovering shows what a click will affect: blue to select, red to erase.
    this.input.on("gameobjectover", (_p: Phaser.Input.Pointer, image: Phaser.GameObjects.Image) => {
      if (typeof image.getData("objectId") !== "string") return;
      if (this.tool === "erase") image.setTint(ERASE_TINT);
      else if (this.tool === "select") image.setTint(HOVER_TINT);
    });
    this.input.on("gameobjectout", (_p: Phaser.Input.Pointer, image: Phaser.GameObjects.Image) => {
      if (typeof image.getData("objectId") === "string") image.clearTint();
    });
  }

  private setupPanAndZoom(): void {
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.panning !== null) {
        const camera = this.cameras.main;
        camera.scrollX = this.panning.scrollX - (pointer.x - this.panning.x) / camera.zoom;
        camera.scrollY = this.panning.scrollY - (pointer.y - this.panning.y) / camera.zoom;
      }
      if (this.ghost !== null && this.placing !== null) {
        const [x, y] = this.snapPoint(pointer.worldX, pointer.worldY, this.placing);
        this.ghost.setPosition(x, y).setVisible(true);
      }
      this.events_.onPointer(Math.round(pointer.worldX), Math.round(pointer.worldY));
    });

    this.input.on("pointerup", () => {
      this.panning = null;
      if (this.tool === "hand") this.input.setDefaultCursor("grab");
    });

    this.input.on("gameout", () => this.ghost?.setVisible(false));

    this.input.on("wheel", (pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
      this.zoomBy(dy > 0 ? 0.9 : 1.1, pointer.x, pointer.y);
    });
  }

  /** Snap to the grid (if enabled) and keep the whole object inside the world. */
  snapPoint(x: number, y: number, kind: Kind): [number, number] {
    let px = x;
    let py = y;
    if (this.options.snapToGrid) {
      px = snap(px, kind, this.options.gridSize);
      py = snap(py, kind, this.options.gridSize);
    }
    return clampToWorld(px, py, kind);
  }

  /** Switch tool. The brush needs the kind it paints; the other tools ignore it. */
  setTool(tool: Tool, kind: Kind | null = null): void {
    this.tool = tool;
    this.placing = tool === "brush" ? kind : null;
    if (!this.sys.isActive()) return; // applied again in create()
    this.ghost?.destroy();
    this.ghost = null;
    if (this.placing !== null) {
      const texture = KIND_TEXTURE[this.placing];
      this.ghost = this.add.image(-100, -100, texture.key).setAlpha(0.6).setDepth(60).setVisible(false);
    }
    const cursors: Record<Tool, string> = { select: "default", hand: "grab", brush: "crosshair", erase: "not-allowed" };
    this.input.setDefaultCursor(cursors[tool]);
    for (const image of this.drawnImages()) {
      image.clearTint();
      image.input!.cursor = tool === "select" ? "pointer" : cursors[tool];
    }
    if (tool !== "select") this.select(null);
  }

  setOptions(options: EditorOptions): void {
    this.options = options;
    if (this.grid !== undefined) this.drawGrid();
  }

  private drawGrid(): void {
    if (this.grid === undefined) return;
    this.grid.clear();
    if (!this.options.showGrid) return;
    // Zoomed far out (a phone showing the whole world) the lines would blur into stripes:
    // keep them about one screen pixel wide and skip some until they are at least 6 px apart.
    const zoom = this.cameras.main.zoom || 1;
    let size = this.options.gridSize;
    while (size * zoom < 6) size *= 2;
    this.grid.lineStyle(Math.max(1, 1 / zoom), 0x000000, zoom < 0.5 ? 0.1 : 0.18);
    for (let x = size; x < WORLD_WIDTH; x += size) this.grid.lineBetween(x, 0, x, WORLD_HEIGHT);
    for (let y = size; y < WORLD_HEIGHT; y += size) this.grid.lineBetween(0, y, WORLD_WIDTH, y);
  }

  private lastView = "";

  update(): void {
    if (this.drawnVersion !== this.model.version) {
      this.redraw();
      this.drawnVersion = this.model.version;
    }
    // Tell the page where the world is on screen, so the frame hugs its edges.
    const camera = this.cameras.main;
    const left = Math.round((0 - camera.worldView.x) * camera.zoom);
    const top = Math.round((0 - camera.worldView.y) * camera.zoom);
    const width = Math.round(WORLD_WIDTH * camera.zoom);
    const height = Math.round(WORLD_HEIGHT * camera.zoom);
    const view = `${left},${top},${width},${height}`;
    if (view !== this.lastView) {
      this.lastView = view;
      this.events_.onView?.(left, top, width, height);
    }
  }

  private drawnImages(): Phaser.GameObjects.Image[] {
    return this.children.list.filter(
      (child): child is Phaser.GameObjects.Image => typeof child.getData("objectId") === "string",
    );
  }

  /** Draw everything again (after the account's creations change colour). */
  refresh(): void {
    if (this.sys?.isActive()) this.redraw();
  }

  private redraw(): void {
    this.drawnImages().forEach((image) => image.destroy());
    for (const object of this.model) {
      this.drawObject(object);
    }
    if (this.selectedId !== null && this.model.find(this.selectedId) === undefined) {
      this.select(null);
    }
    this.drawSelection();
  }

  private drawObject(object: GameObject): void {
    const texture = KIND_TEXTURE[object.kind];
    const sprite = this.add.sprite(object.x, object.y, texture.key);
    const tint = variantTint(object.kind, object.variant);
    if (tint !== null) sprite.setTint(tint);
    if (object.kind === "coin" || isEnemy(object.kind) || isCharacter(object.kind)) bob(this, sprite);
    // Taller objects further down the screen are drawn on top (fake depth).
    sprite.setDepth(object.kind === "water" ? -6 : isGround(object.kind) ? (object.kind === "bridge" ? -4 : -5) : object.y / WORLD_HEIGHT);
    sprite.setData("objectId", object.id);
    sprite.setData("kind", object.kind);
    sprite.setInteractive({ draggable: true, cursor: this.tool === "select" ? "pointer" : undefined });
  }

  select(id: string | null): void {
    this.selectedId = id;
    this.drawSelection();
    this.events_.onSelect(id);
  }

  private drawSelection(): void {
    // A project can be opened while the scene is still loading its textures:
    // create() draws the selection once it is ready.
    if (this.selection === undefined) return;
    this.selection.clear();
    if (this.selectedId === null) return;
    const image = this.drawnImages().find((i) => i.getData("objectId") === this.selectedId);
    if (image === undefined) return;
    const [w, h] = SIZES[image.getData("kind") as Kind];
    this.selection.lineStyle(2, 0xffffff, 1).strokeRect(image.x - w / 2 - 3, image.y - h / 2 - 3, w + 6, h + 6);
    this.selection.lineStyle(1, 0x6c8cff, 1).strokeRect(image.x - w / 2 - 5, image.y - h / 2 - 5, w + 10, h + 10);
  }
}
