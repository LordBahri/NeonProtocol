import {
  Application,
  Container,
  Texture,
  Sprite,
  ColorMatrixFilter,
  Filter,
  GlProgram,
  UniformGroup,
} from 'pixi.js';
import { WarpFilter } from './shaders/WarpShader.js';
import { DistortionFilter } from './shaders/DistortionShader.js';
import { FILTER_VERT } from './shaders/FilterVertex.js';

// ── Vignette ─────────────────────────────────────────────────────────────────

const VIGNETTE_FRAG = /* glsl */ `
precision mediump float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uStrength;
uniform float uSoftness;

void main(void) {
  vec4 src = texture(uTexture, vTextureCoord);
  vec2 uv  = vTextureCoord;

  float vx  = uv.x * (1.0 - uv.x);
  float vy  = uv.y * (1.0 - uv.y);
  float vig = pow(vx * vy * 15.0, uStrength);
  vig = mix(1.0 - uSoftness, 1.0, vig);

  finalColor = vec4(src.rgb * vig, src.a);
}
`;

class VignetteFilter extends Filter {
  private _u: UniformGroup;

  constructor(strength = 0.55, softness = 0.25) {
    const u = new UniformGroup({
      uStrength: { value: strength, type: 'f32' },
      uSoftness: { value: softness, type: 'f32' },
    });
    super({
      glProgram: GlProgram.from({ vertex: FILTER_VERT, fragment: VIGNETTE_FRAG, name: 'vignette' }),
      resources: { vigUniforms: u },
    });
    this._u = u;
  }

  set strength(v: number) { this._u.uniforms['uStrength'] = v; }
  set softness(v: number) { this._u.uniforms['uSoftness'] = v; }
}

// ── PostProcessPipeline ───────────────────────────────────────────────────────

export interface PostProcessOptions {
  exposure?: number;
  vignetteStrength?: number;
  distortion?: boolean;
  distortionStrength?: number;
}

export class PostProcessPipeline {
  private app: Application;

  private vignetteFilter: VignetteFilter;
  private exposureFilter: ColorMatrixFilter;
  private distortionFilter: DistortionFilter;
  readonly warpFilter: WarpFilter;

  private stageOverlay: Container;
  private distortionTarget: Container | null = null;

  private _exposure = 1.0;
  private _time     = 0;
  private _warpDirection = 0;

  constructor(app: Application, opts: PostProcessOptions = {}) {
    this.app = app;

    this.vignetteFilter   = new VignetteFilter(opts.vignetteStrength ?? 0.55);
    this.exposureFilter   = new ColorMatrixFilter();
    this.distortionFilter = new DistortionFilter(opts.distortionStrength ?? 0.003);
    this.warpFilter       = new WarpFilter();

    this.stageOverlay = new Container();
    this.stageOverlay.label     = 'post_process_overlay';
    this.stageOverlay.eventMode = 'none';

    // Vignette overlay — full-screen transparent sprite with filter
    const vigSprite  = new Sprite(Texture.EMPTY);
    vigSprite.width  = app.screen.width;
    vigSprite.height = app.screen.height;
    vigSprite.filters = [this.vignetteFilter];
    vigSprite.eventMode = 'none';
    this.stageOverlay.addChild(vigSprite);

    app.stage.addChild(this.stageOverlay);

    this.setExposure(opts.exposure ?? 1.05);
    if (opts.distortion ?? true) this.enableDistortion(null);
  }

  /**
   * Attach subtle spatial distortion to a container (e.g. the world container).
   * Pass null to remove distortion.
   */
  enableDistortion(target: Container | null): void {
    if (this.distortionTarget) {
      this.distortionTarget.filters =
        (this.distortionTarget.filters as Filter[]).filter(f => f !== this.distortionFilter);
    }
    this.distortionTarget = target;
    if (target) {
      const existing = (target.filters as Filter[]) ?? [];
      target.filters = [...existing, this.distortionFilter];
    }
  }

  /**
   * Attach bloom-style exposure boost to a container.
   * Uses ColorMatrixFilter — multiply each channel by the exposure value.
   */
  enableExposure(target: Container): void {
    const existing = (target.filters as Filter[]) ?? [];
    target.filters = [...existing, this.exposureFilter];
  }

  setExposure(v: number): void {
    this._exposure = Math.max(0.1, Math.min(3, v));
    this.exposureFilter.brightness(this._exposure, false);
  }

  /**
   * Trigger a warp effect (progress ramps 0→1→0 over `duration` seconds).
   */
  startWarp(duration = 1.2): void {
    this._warpDirection = 1;
    this._warpDuration = duration;
    this._warpElapsed  = 0;
    this.app.stage.filters = [this.warpFilter];
  }

  private _warpDuration = 1.2;
  private _warpElapsed  = 0;

  stopWarp(): void {
    this.app.stage.filters = [];
    this.warpFilter.progress = 0;
    this._warpDirection = 0;
  }

  update(dt: number): void {
    this._time += dt;
    this.distortionFilter.time = this._time;

    if (this._warpDirection !== 0) {
      this._warpElapsed += dt;
      const t = Math.min(this._warpElapsed / this._warpDuration, 1);
      // Ease in, then ease out
      const eased = t < 0.5
        ? 2 * t * t
        : 1 - Math.pow(-2 * t + 2, 2) / 2;
      this.warpFilter.progress = eased;
      if (t >= 1) this.stopWarp();
    }
  }

  onResize(): void {
    const vSprite = this.stageOverlay.children[0] as Sprite;
    if (vSprite) {
      vSprite.width  = this.app.screen.width;
      vSprite.height = this.app.screen.height;
    }
  }

  destroy(): void {
    this.stageOverlay.destroy({ children: true });
  }
}
