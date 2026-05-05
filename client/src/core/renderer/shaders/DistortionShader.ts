import { Filter, GlProgram, UniformGroup } from 'pixi.js';
import { FILTER_VERT } from './FilterVertex.js';

const DISTORTION_FRAG = /* glsl */ `
precision highp float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uTime;
uniform float uStrength;
uniform vec2 uFrequency;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float snoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i),             hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  ) * 2.0 - 1.0;
}

void main(void) {
  vec2 uv = vTextureCoord;
  float t  = uTime * 0.18;

  vec2 noiseUV = uv * uFrequency;
  float nx = snoise(noiseUV + vec2(t,        t * 0.7));
  float ny = snoise(noiseUV + vec2(t * 0.8,  t * 1.3) + vec2(5.2, 1.3));

  vec2 warp = vec2(nx, ny) * uStrength;
  finalColor = texture(uTexture, uv + warp);
}
`;

export class DistortionFilter extends Filter {
  private _uniforms: UniformGroup;

  constructor(strength = 0.004, frequencyX = 3.0, frequencyY = 3.0) {
    const uniforms = new UniformGroup({
      uTime:      { value: 0.0,                                  type: 'f32'      },
      uStrength:  { value: strength,                             type: 'f32'      },
      uFrequency: { value: new Float32Array([frequencyX, frequencyY]), type: 'vec2<f32>'},
    });

    super({
      glProgram: GlProgram.from({ vertex: FILTER_VERT, fragment: DISTORTION_FRAG, name: 'distortion' }),
      resources: { distortUniforms: uniforms },
    });

    this._uniforms = uniforms;
  }

  set time(v: number)     { this._uniforms.uniforms['uTime']     = v; }
  set strength(v: number) { this._uniforms.uniforms['uStrength'] = v; }
}
