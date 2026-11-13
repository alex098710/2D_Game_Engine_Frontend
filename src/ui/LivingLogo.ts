import { LogoFx } from "./fx";
import { NightScene } from "./NightScene";

/**
 * The access screen is alive: a pixel-art night with a castle and a wizard
 * casting spells fills the background (NightScene), and the emblem throws
 * sparks and lightning (LogoFx).
 */
export class LivingLogo {
  readonly fx: LogoFx;
  private readonly scene: NightScene;

  constructor(host: HTMLElement, sceneCanvas: HTMLCanvasElement, fxCanvas: HTMLCanvasElement, emblem: HTMLElement, spot: HTMLElement) {
    this.fx = new LogoFx(fxCanvas, host, emblem);
    this.scene = new NightScene(sceneCanvas, host, spot);
  }

  start(): void {
    this.scene.start();
    this.fx.start();
  }

  stop(): void {
    this.scene.stop();
    this.fx.stop();
  }

  /** The celebration when the user gets in: the emblem strikes and the wizard casts. */
  celebrate(): void {
    this.fx.strikeNow();
    this.scene.castNow();
  }
}
