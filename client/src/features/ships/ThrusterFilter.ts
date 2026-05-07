import { Filter, GlProgram, UniformGroup } from 'pixi.js';
import { FILTER_VERT } from '../../core/renderer/shaders/FilterVertex.ts';

const THRUSTER_FRAG = /* glsl */ `
precision mediump float;

in  vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uTime;
uniform float uIntensity;
uniform vec3  uGlowColor;

void main(void) {
  vec4 src = texture(uTexture, vTextureCoord);

  // Rapid discharge flicker (~47 Hz)
  float flicker = sin(uTime * 47.0) * 0.06 + 0.94;
  // Slow engine pulse (~11 Hz)
  float pulse   = sin(uTime * 11.0) * 0.14 + 0.86;

  float energy  = uIntensity * flicker * pulse;

  // Neon glow additive contribution
  vec3  neon    = uGlowColor * energy * 0.45;

  finalColor = vec4(src.rgb * energy + neon, src.a * energy);
}
`;

export class ThrusterFilter extends Filter {
  private _u: UniformGroup;

  constructor(glowColor: [number, number, number] = [0.0, 0.72, 1.0]) {
    const u = new UniformGroup({
      uTime:      { value: 0,         type: 'f32'       },
      uIntensity: { value: 0,         type: 'f32'       },
      uGlowColor: { value: glowColor, type: 'vec3<f32>' },
    });
    super({
      glProgram: GlProgram.from({ vertex: FILTER_VERT, fragment: THRUSTER_FRAG, name: 'thruster' }),
      resources: { thrusterUniforms: u },
    });
    this._u = u;
  }

  set time(v: number)      { this._u.uniforms['uTime']      = v; }
  set intensity(v: number) { this._u.uniforms['uIntensity'] = v; }
}
