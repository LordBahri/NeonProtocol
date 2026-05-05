import { Filter, GlProgram, UniformGroup } from 'pixi.js';
import { FILTER_VERT } from './FilterVertex.js';

const NEBULA_FRAG = /* glsl */ `
precision highp float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uTime;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform float uDensity;
uniform float uScale;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8776, 0.4794, -0.4794, 0.8776);
  for (int i = 0; i < 6; i++) {
    v += a * noise(p);
    p = rot * p * 2.1 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

void main(void) {
  vec2 uv = vTextureCoord * uScale;
  float t = uTime * 0.012;

  float q  = fbm(uv + t);
  float r  = fbm(uv + q * 1.5 + vec2(1.7, 9.2) + t * 0.7);
  float density = fbm(uv + r * 1.2 + vec2(8.3, 2.8) + t * 0.5);

  float cloud = smoothstep(0.38, 0.72, density) * uDensity;

  vec3 col = mix(uColor1, uColor2, clamp(r, 0.0, 1.0));
  col      = mix(col, uColor3, clamp((density - 0.5) * 2.0, 0.0, 1.0));

  vec4 src = texture(uTexture, vTextureCoord);
  finalColor = src + vec4(col * cloud, cloud * 0.75);
}
`;

export interface NebulaFilterOptions {
  color1?: [number, number, number];
  color2?: [number, number, number];
  color3?: [number, number, number];
  density?: number;
  scale?: number;
}

export class NebulaFilter extends Filter {
  private _uniforms: UniformGroup;

  constructor(opts: NebulaFilterOptions = {}) {
    const {
      color1 = [0.0, 0.15, 0.55],
      color2 = [0.35, 0.0, 0.65],
      color3 = [0.0, 0.45, 0.70],
      density = 0.28,
      scale   = 2.2,
    } = opts;

    const uniforms = new UniformGroup({
      uTime:    { value: 0.0,                          type: 'f32'      },
      uColor1:  { value: new Float32Array(color1),     type: 'vec3<f32>'},
      uColor2:  { value: new Float32Array(color2),     type: 'vec3<f32>'},
      uColor3:  { value: new Float32Array(color3),     type: 'vec3<f32>'},
      uDensity: { value: density,                      type: 'f32'      },
      uScale:   { value: scale,                        type: 'f32'      },
    });

    super({
      glProgram: GlProgram.from({ vertex: FILTER_VERT, fragment: NEBULA_FRAG, name: 'nebula' }),
      resources: { nebulaUniforms: uniforms },
    });

    this._uniforms = uniforms;
  }

  set time(v: number)    { this._uniforms.uniforms['uTime']    = v; }
  set density(v: number) { this._uniforms.uniforms['uDensity'] = v; }
  set scale(v: number)   { this._uniforms.uniforms['uScale']   = v; }
}
