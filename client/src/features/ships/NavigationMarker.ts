import { gsap }                                    from 'gsap';
import { Mesh, Geometry, Shader, GlProgram,
         UniformGroup }                            from 'pixi.js';
import type { RenderPipeline }                     from '../../core/renderer/RenderPipeline.ts';
import { RenderLayer }                             from '../../core/renderer/LayerManager.ts';
import type { Container }                          from 'pixi.js';

// ── Vertex shader ─────────────────────────────────────────────────────────────

const VERT = /* glsl */ `
in  vec2 aPosition;
out vec2 vUV;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;

void main(void) {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aPosition;
}
`;

// ── Fragment shader ───────────────────────────────────────────────────────────

const FRAG = /* glsl */ `
precision highp float;

in  vec2  vUV;
out vec4  finalColor;

uniform float uTime;
uniform float uAlpha;
uniform vec3  uColor;

#define PI 3.14159265358979

void main(void) {
  float r   = length(vUV);
  float ang = atan(vUV.y, vUV.x);

  const float INNER = 0.70;
  const float OUTER = 0.82;

  if (r > OUTER + 0.10) discard;

  float softEdge = smoothstep(INNER - 0.04, INNER, r)
                 * smoothstep(OUTER + 0.04, OUTER, r);

  // Tick marks every 45°
  float normAng  = (ang / PI + 1.0) * 0.5;
  float tickFrac = fract(normAng * 8.0);
  float tick     = step(0.88, tickFrac);

  // Rotating sweep
  float sweepAng = mod(uTime * 2.5, PI * 2.0);
  float angDiff  = ang - sweepAng;
  angDiff -= floor((angDiff + PI) / (PI * 2.0)) * (PI * 2.0);
  float trail    = clamp(1.0 - (-angDiff) / (PI * 0.67), 0.0, 1.0) * step(angDiff, 0.0);
  float sweep    = trail * 0.25 + step(abs(angDiff), 0.04) * 0.5;

  // Centre dot
  float dot_ = smoothstep(0.06, 0.02, r);

  float ring  = softEdge * (0.5 + tick * 0.8 + sweep * 0.6);
  float total = max(ring, dot_);

  finalColor = vec4(uColor * total, total * uAlpha);
}
`;

// ── Geometry ──────────────────────────────────────────────────────────────────

function makeQuadGeometry(): Geometry {
  return new Geometry({
    attributes: {
      aPosition: {
        buffer: new Float32Array([-1, -1,  1, -1,  1, 1,  -1, 1]),
        format: 'float32x2',
      },
    },
    indexBuffer: new Uint16Array([0, 1, 2, 0, 2, 3]),
  });
}

// ── NavigationMarker ─────────────────────────────────────────────────────────

export class NavigationMarker {
  private _mesh: Mesh<Geometry, Shader> | null = null;
  private _layer: Container;
  private _time    = 0;
  private _alpha   = 0;
  private _ug: UniformGroup | null = null;

  constructor(pipeline: RenderPipeline) {
    this._layer = pipeline.layers.get(RenderLayer.FX_OVER);
  }

  show(worldX: number, worldY: number): void {
    this._destroyMesh();

    const ug = new UniformGroup({
      uTime:  { value: 0,                                    type: 'f32'       },
      uAlpha: { value: 0,                                    type: 'f32'       },
      uColor: { value: new Float32Array([0.0, 0.88, 1.0]),   type: 'vec3<f32>' },
    });
    this._ug    = ug;
    this._alpha = 0;

    const program = GlProgram.from({ vertex: VERT, fragment: FRAG, name: 'nav-marker' });
    const shader  = new Shader({ glProgram: program, resources: { navUniforms: ug } });

    this._mesh           = new Mesh({ geometry: makeQuadGeometry(), shader });
    this._mesh.blendMode = 'add';

    const RADIUS = 40;
    this._mesh.scale.set(RADIUS);
    this._mesh.position.set(worldX, worldY);
    this._layer.addChild(this._mesh);

    gsap.killTweensOf(this);
    gsap.killTweensOf(this._mesh.scale);

    gsap.fromTo(
      this._mesh.scale,
      { x: 0, y: 0 },
      { x: RADIUS, y: RADIUS, duration: 0.25, ease: 'back.out(2)' },
    );
    gsap.to(this, { _alpha: 1.0, duration: 0.18, ease: 'power2.out' });
  }

  hide(): void {
    if (!this._mesh) return;
    const mesh = this._mesh;
    this._mesh = null;
    gsap.killTweensOf(this);
    gsap.to(this, {
      _alpha: 0,
      duration: 0.30,
      ease: 'power2.in',
      onComplete: () => { mesh.destroy(); },
    });
  }

  update(dt: number): void {
    this._time += dt;
    if (!this._ug) return;
    this._ug.uniforms['uTime']  = this._time;
    this._ug.uniforms['uAlpha'] = this._alpha;
  }

  destroy(): void {
    gsap.killTweensOf(this);
    this._destroyMesh();
  }

  private _destroyMesh(): void {
    if (!this._mesh) return;
    gsap.killTweensOf(this._mesh.scale);
    this._mesh.destroy();
    this._mesh = null;
    this._ug   = null;
  }
}
