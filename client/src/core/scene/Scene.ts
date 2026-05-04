import type { World } from '../ecs/World.ts';
import type { RenderPipeline } from '../renderer/RenderPipeline.ts';

export abstract class Scene {
  abstract readonly name: string;

  onEnter(_from: Scene | null): void | Promise<void> {}
  onExit(_to: Scene | null): void | Promise<void> {}
  update(_dt: number, _world: World): void {}
  render(_alpha: number, _world: World, _pipeline: RenderPipeline): void {}
  onResize(_width: number, _height: number): void {}
  dispose(): void {}
}
