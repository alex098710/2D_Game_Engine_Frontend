import { BattleDiorama } from "./BattleDiorama";
import { LogoFx } from "./fx";

/**
 * The left side of the access screen is alive: a battlefield drawn with the
 * engine's textures moves behind the logo (BattleDiorama), and the emblem
 * throws sparks and lightning (LogoFx).
 */
export class LivingLogo {
  readonly fx: LogoFx;
  private readonly battle: BattleDiorama;

  constructor(host: HTMLElement, battleCanvas: HTMLCanvasElement, fxCanvas: HTMLCanvasElement, emblem: HTMLElement) {
    this.fx = new LogoFx(fxCanvas, host, emblem);
    this.battle = new BattleDiorama(battleCanvas);
  }

  start(): void {
    this.battle.start();
    this.fx.start();
  }

  stop(): void {
    this.battle.stop();
    this.fx.stop();
  }
}
