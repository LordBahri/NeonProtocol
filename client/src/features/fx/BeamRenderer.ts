import { Container, Graphics } from 'pixi.js';
import type { RenderPipeline } from '../../core/renderer/RenderPipeline.ts';
import { RenderLayer } from '../../core/renderer/LayerManager.ts';
import { globalBus } from '../../core/network/MessageBus.ts';
import type { EntityId } from '../../core/ecs/types.ts';

interface BeamState {
  targetEntity: EntityId;
  color: number;
  width: number;
  kinkPhase: number;
}

type GetPosFn = (entity: EntityId) => { x: number; y: number } | null;

export class BeamRenderer {
  private gfx: Graphics;
  private impactGfx: Graphics;
  private beams = new Map<EntityId, BeamState>();
  private getPos: GetPosFn;
  private time = 0;
  private unsubs: Array<() => void> = [];

  constructor(pipeline: RenderPipeline, getPos: GetPosFn) {
    const layer: Container = pipeline.layers.get(RenderLayer.FX_OVER);

    this.gfx = new Graphics();
    this.gfx.blendMode = 'add';
    this.impactGfx = new Graphics();
    this.impactGfx.blendMode = 'add';
    layer.addChild(this.gfx);
    layer.addChild(this.impactGfx);

    this.getPos = getPos;

    this.unsubs.push(
      globalBus.on<{ entity: EntityId; targetEntity: EntityId; color: number; width: number }>(
        'combat:beam_start',
        ({ entity, targetEntity, color, width }) => {
          this.beams.set(entity, {
            targetEntity, color, width,
            kinkPhase: Math.random() * Math.PI * 2,
          });
        },
      ),
      globalBus.on<{ entity: EntityId }>(
        'combat:beam_end',
        ({ entity }) => { this.beams.delete(entity); },
      ),
      globalBus.on<{ entity: EntityId; targetEntity: EntityId; color: number; width: number }>(
        'combat:beam_update',
        ({ entity, targetEntity, color, width }) => {
          const b = this.beams.get(entity);
          if (b) { b.targetEntity = targetEntity; b.color = color; b.width = width; }
        },
      ),
    );
  }

  update(dt: number): void {
    this.time += dt;
    this.gfx.clear();
    this.impactGfx.clear();

    for (const [shooterId, beam] of this.beams) {
      const src = this.getPos(shooterId);
      const dst = this.getPos(beam.targetEntity);
      if (!src || !dst) continue;
      this._drawBeam(src.x, src.y, dst.x, dst.y, beam);
      this._drawImpact(dst.x, dst.y, beam);
    }
  }

  private _drawBeam(x1: number, y1: number, x2: number, y2: number, beam: BeamState): void {
    const angle  = Math.atan2(y2 - y1, x2 - x1);
    const perp   = angle + Math.PI / 2;
    const px     = Math.cos(perp);
    const py     = Math.sin(perp);
    const w      = beam.width;
    const SEGS   = 10;
    const amp    = w * 1.5;
    const freq   = 10;
    const phase  = this.time * 9 + beam.kinkPhase;

    const buildPath = (kinkScale: number): Array<[number, number]> => {
      const pts: Array<[number, number]> = [[x1, y1]];
      for (let i = 1; i <= SEGS; i++) {
        const t    = i / SEGS;
        const bx   = x1 + (x2 - x1) * t;
        const by   = y1 + (y2 - y1) * t;
        const kink = Math.sin(t * freq + phase) * amp * kinkScale;
        pts.push([bx + px * kink, by + py * kink]);
      }
      return pts;
    };

    const drawPath = (pts: Array<[number, number]>, strokeW: number, color: number, alpha: number) => {
      this.gfx.moveTo(pts[0]![0], pts[0]![1]);
      for (let i = 1; i < pts.length; i++) this.gfx.lineTo(pts[i]![0], pts[i]![1]);
      this.gfx.stroke({ width: strokeW, color, alpha });
    };

    const outerPts = buildPath(1.0);
    const corePts  = buildPath(0.25);

    // Outer glow
    drawPath(outerPts, w * 7, beam.color, 0.10);
    // Mid glow
    drawPath(outerPts, w * 3, beam.color, 0.45);
    // Bright core (barely kinked for stability feel)
    drawPath(corePts,  Math.max(1, w * 0.7), 0xffffff, 0.95);
  }

  private _drawImpact(x: number, y: number, beam: BeamState): void {
    const pulse = 0.65 + 0.35 * Math.sin(this.time * 22);
    const r     = beam.width * 5;

    this.impactGfx.circle(x, y, r * 2.8 * pulse);
    this.impactGfx.fill({ color: beam.color, alpha: 0.12 });

    this.impactGfx.circle(x, y, r * pulse);
    this.impactGfx.fill({ color: 0xffffff, alpha: 0.55 });
  }

  destroy(): void {
    for (const unsub of this.unsubs) unsub();
    this.gfx.destroy();
    this.impactGfx.destroy();
  }
}
