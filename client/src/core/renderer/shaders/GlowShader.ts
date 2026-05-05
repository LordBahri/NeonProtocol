import { Filter, GlProgram, UniformGroup } from 'pixi.js';
import { FILTER_VERT } from './FilterVertex.js';

const GLOW_FRAG = /* glsl */ `
precision highp float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uStrength;
uniform vec3 uGlowColor;
uniform float uRadius;

void main(void) {
  vec4 src = texture(uTexture, vTextureCoord);

  // Sample neighbours at radius steps to approximate glow spread
  float totalAlpha = 0.0;
  const int STEPS = 8;
  for (int i = 0; i < STEPS; i++) {
    float angle = float(i) * 3.14159265 * 2.0 / float(STEPS);
    vec2 offset = vec2(cos(angle), sin(angle)) * uRadius;
    totalAlpha += texture(uTexture, vTextureCoord + offset).a;
  }
  float glow = (totalAlpha / float(STEPS)) * uStrength;

  vec3 glowRgb = uGlowColor * glow;
  finalColor = vec4(src.rgb + glowRgb, src.a + glow * (1.0 - src.a));
}
`;

export class GlowFilter extends Filter {
  private _uniforms: UniformGroup;

  constructor(color = 0x00aaff, strength = 1.2, radius = 0.003) {
    const r = ((color >> 16) & 0xff) / 255;
    const g = ((color >>  8) & 0xff) / 255;
    const b = ( color        & 0xff) / 255;

    const uniforms = new UniformGroup({
      uStrength:  { value: strength,                      type: 'f32'      },
      uGlowColor: { value: new Float32Array([r, g, b]),   type: 'vec3<f32>'},
      uRadius:    { value: radius,                        type: 'f32'      },
    });

    super({
      glProgram: GlProgram.from({ vertex: FILTER_VERT, fragment: GLOW_FRAG, name: 'glow' }),
      resources: { glowUniforms: uniforms },
    });

    this._uniforms = uniforms;
  }

  set strength(v: number) { this._uniforms.uniforms['uStrength'] = v; }
  set radius(v: number)   { this._uniforms.uniforms['uRadius']   = v; }
}
