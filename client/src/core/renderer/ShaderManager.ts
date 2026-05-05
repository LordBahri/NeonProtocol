import { Filter, GlProgram, UniformGroup } from 'pixi.js';

export interface ShaderDef {
  name: string;
  vertex: string;
  fragment: string;
  resources?: Record<string, UniformGroup>;
}

export class ShaderManager {
  private programs = new Map<string, GlProgram>();
  private filters  = new Map<string, Filter>();

  registerProgram(def: ShaderDef): GlProgram {
    const program = GlProgram.from({ vertex: def.vertex, fragment: def.fragment });
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
    const filter  = new Filter({ glProgram: program, resources: def.resources ?? {} });
    this.filters.set(name, filter);
    return filter;
  }

  getFilter(name: string): Filter {
    const f = this.filters.get(name);
    if (!f) throw new Error(`Filter "${name}" not found`);
    return f;
  }
}

// ── Built-in shader snippets (GLSL 300 es, no #version — PixiJS prepends it) ──

/** Adds a neon glow tint on top of the source texture. */
export const NEON_GLOW_FRAG = /* glsl */ `
precision mediump float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uGlowStrength;
uniform vec3  uGlowColor;

void main(void) {
  vec4 color = texture(uTexture, vTextureCoord);
  float lum  = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  vec3  glow = uGlowColor * lum * uGlowStrength;
  finalColor = vec4(color.rgb + glow, color.a);
}
`;

/** CRT-style horizontal scanlines. */
export const SCANLINE_FRAG = /* glsl */ `
precision mediump float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uTime;
uniform float uIntensity;

void main(void) {
  vec4  color    = texture(uTexture, vTextureCoord);
  float line     = mod(gl_FragCoord.y + uTime * 20.0, 4.0);
  float scanline = line < 2.0 ? 1.0 : 1.0 - uIntensity * 0.15;
  finalColor     = vec4(color.rgb * scanline, color.a);
}
`;
