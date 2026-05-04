import type { Scene } from './Scene.ts';
import { FadeTransition } from './transitions/FadeTransition.ts';
import type { World } from '../ecs/World.ts';
import type { RenderPipeline } from '../renderer/RenderPipeline.ts';

export type TransitionType = 'none' | 'fade';

export interface SwitchOptions {
  transition?: TransitionType;
  transitionDuration?: number;
}

export class SceneManager {
  private current: Scene | null = null;
  private stack: Scene[] = [];
  private transitioning = false;
  private fade = new FadeTransition();

  get currentScene(): Scene | null { return this.current; }
  get isTransitioning(): boolean { return this.transitioning; }

  async switchTo(next: Scene, opts: SwitchOptions = {}): Promise<void> {
    if (this.transitioning) return;
    this.transitioning = true;

    const prev = this.current;
    const transition = opts.transition ?? 'fade';
    const duration = opts.transitionDuration ?? 0.25;

    if (transition === 'fade') await this.fade.fadeOut({ duration });

    if (prev) {
      await prev.onExit(next);
      prev.dispose();
    }

    this.current = next;
    this.stack = [next];
    await next.onEnter(prev);

    if (transition === 'fade') await this.fade.fadeIn({ duration });
    this.transitioning = false;
  }

  async push(next: Scene, opts: SwitchOptions = {}): Promise<void> {
    if (this.transitioning) return;
    this.transitioning = true;

    const prev = this.current;
    const duration = opts.transitionDuration ?? 0.2;

    if (opts.transition === 'fade') await this.fade.fadeOut({ duration });

    await next.onEnter(prev);
    this.stack.push(next);
    this.current = next;

    if (opts.transition === 'fade') await this.fade.fadeIn({ duration });
    this.transitioning = false;
  }

  async pop(opts: SwitchOptions = {}): Promise<Scene | null> {
    if (this.transitioning || this.stack.length <= 1) return null;
    this.transitioning = true;

    const duration = opts.transitionDuration ?? 0.2;
    if (opts.transition === 'fade') await this.fade.fadeOut({ duration });

    const removed = this.stack.pop()!;
    await removed.onExit(this.stack[this.stack.length - 1] ?? null);
    removed.dispose();

    this.current = this.stack[this.stack.length - 1] ?? null;
    if (this.current) await this.current.onEnter(removed);

    if (opts.transition === 'fade') await this.fade.fadeIn({ duration });
    this.transitioning = false;
    return removed;
  }

  update(dt: number, world: World): void {
    this.current?.update(dt, world);
  }

  render(alpha: number, world: World, pipeline: RenderPipeline): void {
    this.current?.render(alpha, world, pipeline);
  }

  onResize(width: number, height: number): void {
    this.current?.onResize(width, height);
  }

  destroy(): void {
    for (const scene of this.stack) scene.dispose();
    this.stack = [];
    this.current = null;
    this.fade.destroy();
  }
}
