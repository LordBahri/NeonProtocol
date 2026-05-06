import { Filter, GlProgram, UniformGroup } from 'pixi.js';
import { FILTER_VERT } from './FilterVertex.js';

const WARP_FRAG = /* glsl */ `
precision highp float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uProgress;  /* 0 = off, 1 = full warp */
uniform vec2  uCenter;    /* UV space, typically 0.5, 0.5 */
uniform vec3  uLineColor;

float hash(float n) { return fract(sin(n) * 43758.5453123); }

void main(void) {
  vec2 uv = vTextureCoord;

  if (uProgress < 0.001) {
    finalColor = texture(uTexture, uv);
    return;
  }

  vec2  dir  = uv - uCenter;
  float dist = length(dir);
  float angle = atan(dir.y, dir.x);

  /* Radial speed streaks */
  float streakAmt = 60.0;
  float angleId   = floor(angle / (3.14159265 * 2.0 / streakAmt) + streakAmt);
  float streakRnd  = hash(angleId);
  float streak     = step(0.6 + streakRnd * 0.3, fract(angle * streakAmt / (3.14159265 * 2.0)));

  float fade = smoothstep(0.05, 0.25, dist) * smoothstep(0.85, 0.4, dist);
  float lines = streak * fade * uProgress;

  /* Radial stretch blur */
  const int SAMPLES = 8;
  vec4 blurred = vec4(0.0);
  for (int i = 0; i < SAMPLES; i++) {
    float t = float(i) / float(SAMPLES);
    vec2 sampleUV = uv + dir * (t - 0.5) * uProgress * 0.18;
    blurred += texture(uTexture, sampleUV);
  }
  blurred /= float(SAMPLES);

  vec4 src = mix(texture(uTexture, uv), blurred, uProgress * 0.8);
  finalColor = src + vec4(uLineColor * lines, lines * 0.6);
}
`;

export class WarpFilter extends Filter {
  private _uniforms: UniformGroup;

  constructor() {
    const uniforms = new UniformGroup({
      uProgress:  { value: 0.0,                                    type: 'f32'      },
      uCenter:    { value: new Float32Array([0.5, 0.5]),            type: 'vec2<f32>'},
      uLineColor: { value: new Float32Array([0.4, 0.8, 1.0]),      type: 'vec3<f32>'},
    });

    super({
      glProgram: GlProgram.from({ vertex: FILTER_VERT, fragment: WARP_FRAG, name: 'warp' }),
      resources: { warpUniforms: uniforms },
    });

    this._uniforms = uniforms;
  }

  set progress(v: number)  { this._uniforms.uniforms['uProgress'] = Math.max(0, Math.min(1, v)); }
  get progress(): number   { return this._uniforms.uniforms['uProgress'] as number; }
}
