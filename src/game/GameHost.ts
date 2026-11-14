import Phaser from "phaser";
import type { SceneModel } from "../model/SceneModel";
import { EditorScene, type EditorEvents, type EditorOptions } from "./EditorScene";
import { PlayScene, type PlayHooks } from "./PlayScene";

/**
 * Creates the Phaser game that fills its container and switches between
 * editing and playing. The canvas resizes with the window (Scale.RESIZE).
 */
export class GameHost {
  readonly editor: EditorScene;
  private readonly playScene: PlayScene;
  private game: Phaser.Game | null = null;
  private readonly parent: HTMLElement;

  constructor(parent: HTMLElement, model: SceneModel, editorEvents: EditorEvents, playHooks: PlayHooks) {
    this.parent = parent;
    this.editor = new EditorScene(model, editorEvents);
    this.playScene = new PlayScene(model, playHooks);
  }

  start(): void {
    if (this.game !== null) return;
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: this.parent,
      backgroundColor: "#00000000",
      transparent: true,
      pixelArt: true,
      // No "Phaser vX" banner in the browser console.
      banner: false,
      scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
      physics: { default: "arcade", arcade: { gravity: { x: 0, y: 0 }, debug: false } },
      scene: [this.editor, this.playScene],
    });
    // The engine draws 60 times a second; while the workspace is hidden (home,
    // admin panel, intro) nobody sees it, so it sleeps and saves battery and
    // keeps the scroll of the other screens smooth on phones.
    const game = this.game;
    game.events.once(Phaser.Core.Events.READY, () => {
      if (typeof IntersectionObserver === "undefined") return;
      this.visibility = new IntersectionObserver((entries) => {
        const visible = entries.some((entry) => entry.isIntersecting);
        // sleep() and wake() do nothing when the loop is already in that state.
        if (visible) game.loop.wake(true);
        else game.loop.sleep();
      });
      this.visibility.observe(this.parent);
    });
  }

  private visibility: IntersectionObserver | null = null;

  play(difficulty: number, hero: string): void {
    this.game?.scene.stop("editor");
    this.game?.scene.start("play", { difficulty, hero });
  }

  edit(): void {
    this.game?.scene.stop("play");
    this.game?.scene.start("editor");
  }

  /** Start the same run again (restart key or "play again"). */
  restart(difficulty: number, hero: string): void {
    this.game?.scene.stop("play");
    this.game?.scene.start("play", { difficulty, hero });
  }

  quitPlay(): void {
    if (this.game?.scene.isActive("play")) this.playScene.quit();
  }

  setEditorOptions(options: EditorOptions): void {
    this.editor.setOptions(options);
  }

  destroy(): void {
    this.visibility?.disconnect();
    this.visibility = null;
    this.game?.destroy(true);
    this.game = null;
  }
}
