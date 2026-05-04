import { Filter, GlProgram } from 'pixi.js';

export interface ShaderDef {
  name: string;
  vertex: string;
  fragment: string;
  uniforms?: Record<string, unknown>;
}

export class ShaderManager {
  private programs = new Map<string, GlProgram>();
  private filters = new Map<string, Filter>();

  registerProgram(def: ShaderDef): GlProgram {
    const program = GlProgram.from({
      vertex: def.vertex,
      fragment: def.fragment,
    });
    this.programs.set(def.name, program);
    return program;
  }

  getProgram(name: string): GlProgram {
    const prog = this.programs.get(name);
    if (!prog) throw new Error(`Shader program "${name}" not registered`);
    return prog;
  }

  createFilter(name: string, def: ShaderDef): Filter {
    const program = this.registerProgram(def);
    const filter = new Filter({ glProgram: program, resources: def.uniforms ?? {} });
    this.filters.set(name, filter);
    return filter;
  }

  getFilter(name: string): Filter {
    const f = this.filters.get(name);
    if (!f) throw new Error(`Filter "${name}" not found`);
    return f;
  }
}

export const NEON_GLOW_FRAG = /* glsl */ `
  precision mediump float;
  varying vec2 vTextureCoord;
  uniform sampler2D uTexture;
  uniform float uGlowStrength;
  uniform vec3 uGlowColor;

  void main() {
    vec4 color = texture2D(uTexture, vTextureCoord);
    float alpha = color.a;
    vec3 glow = uGlowColor * alpha * uGlowStrength;
    gl_FragColor = vec4(color.rgb + glow, alpha);
  }
`;

export const SCANLINE_FRAG = /* glsl */ `
  precision mediump float;
  varying vec2 vTextureCoord;
  uniform sampler2D uTexture;
  uniform float uTime;
  uniform float uIntensity;
  uniform vec2 uResolution;

  void main() {
    vec4 color = texture2D(uTexture, vTextureCoord);
    float line = mod(gl_FragCoord.y + uTime * 20.0, 4.0);
    float scanline = line < 2.0 ? 1.0 : 1.0 - uIntensity * 0.15;
    gl_FragColor = vec4(color.rgb * scanline, color.a);
  }
`;
