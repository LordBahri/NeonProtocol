import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { World } from '../../core/ecs/World.ts';
import { createEntityId } from '../../core/ecs/types.ts';
import { TransformComponent, NetworkSyncComponent } from '../ships/ShipComponents.ts';

const MINIMAP_SIZE = 140;
const MINIMAP_RANGE = 4000;

export class Minimap {
  readonly container: Container;
  private bg: Graphics;
  private border: Graphics;
  private blips: Graphics;
  private label: Text;

  constructor() {
    this.container = new Container();
    this.container.label = 'minimap';

    this.bg = new Graphics();
    this.bg.circle(MINIMAP_SIZE / 2, MINIMAP_SIZE / 2, MINIMAP_SIZE / 2);
    this.bg.fill({ color: 0x000a10, alpha: 0.85 });

    this.border = new Graphics();
    this.border.circle(MINIMAP_SIZE / 2, MINIMAP_SIZE / 2, MINIMAP_SIZE / 2);
    this.border.stroke({ color: 0x004444, width: 1.5 });
    this.border.circle(MINIMAP_SIZE / 2, MINIMAP_SIZE / 2, MINIMAP_SIZE / 2 - 10);
    this.border.stroke({ color: 0x002222, width: 0.5, alpha: 0.5 });

    this.blips = new Graphics();

    this.label = new Text({
      text: '4km',
      style: new TextStyle({
        fontFamily: 'Courier New',
        fontSize: 9,
        fill: 0x004444,
      }),
    });
    this.label.x = 4;
    this.label.y = MINIMAP_SIZE - 14;

    this.container.addChild(this.bg);
    this.container.addChild(this.border);
    this.container.addChild(this.blips);
    this.container.addChild(this.label);
  }

  update(world: World, playerX: number, playerY: number): void {
    this.blips.clear();

    const entities = world.query(TransformComponent, NetworkSyncComponent);

    for (let i = 0; i < entities.length; i++) {
      const entity = createEntityId(entities[i]!);
      const transform = world.getComponent(entity, TransformComponent)!;
      const sync = world.getComponent(entity, NetworkSyncComponent)!;

      const dx = transform.x - playerX;
      const dy = transform.y - playerY;
      const distSq = dx * dx + dy * dy;

      if (distSq > MINIMAP_RANGE * MINIMAP_RANGE) continue;

      const nx = (dx / MINIMAP_RANGE) * (MINIMAP_SIZE / 2) + MINIMAP_SIZE / 2;
      const ny = (dy / MINIMAP_RANGE) * (MINIMAP_SIZE / 2) + MINIMAP_SIZE / 2;

      if (sync.isLocalPlayer) {
        this.blips.circle(nx, ny, 4);
        this.blips.fill({ color: 0x00ffcc });
        this.blips.circle(nx, ny, 4);
        this.blips.stroke({ color: 0xffffff, width: 1, alpha: 0.6 });

        this.drawDirectionArrow(nx, ny, transform.angle);
      } else {
        this.blips.circle(nx, ny, 2.5);
        this.blips.fill({ color: 0xff3300 });
      }
    }

    const cx = MINIMAP_SIZE / 2;
    const cy = MINIMAP_SIZE / 2;
    for (let i = 1; i <= 2; i++) {
      const r = (MINIMAP_SIZE / 2) * (i / 2.5);
      this.blips.circle(cx, cy, r);
      this.blips.stroke({ color: 0x002233, width: 0.5, alpha: 0.4 });
    }
  }

  private drawDirectionArrow(x: number, y: number, angle: number): void {
    const len = 8;
    const ex = x + Math.cos(angle) * len;
    const ey = y + Math.sin(angle) * len;
    this.blips.moveTo(x, y);
    this.blips.lineTo(ex, ey);
    this.blips.stroke({ color: 0x00ffcc, width: 1.5, alpha: 0.8 });
  }

  positionBottomRight(screenW: number, screenH: number): void {
    this.container.x = screenW - MINIMAP_SIZE - 16;
    this.container.y = screenH - MINIMAP_SIZE - 16;
  }
}
