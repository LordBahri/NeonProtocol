import { Filter, GlProgram, UniformGroup } from 'pixi.js';
import type { TextureSource } from 'pixi.js';

// ── Vertex shader ─────────────────────────────────────────────────────────────
// Standard PixiJS filter vertex + vNormalizedUV for standalone texture sampling.

const MATERIAL_VERT = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vNormalizedUV;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
  gl_Position   = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
  vNormalizedUV = aPosition;   // 0→1 over the sprite quad, for standalone textures
}
`;

// ── Fragment shader ───────────────────────────────────────────────────────────

const MATERIAL_FRAG = /* glsl */ `
precision highp float;

in  vec2 vTextureCoord;   // PixiJS framebuffer UV — albedo
in  vec2 vNormalizedUV;   // 0→1 quad UV — height & roughness maps
out vec4 finalColor;

// PixiJS provides the rendered sprite (albedo) here automatically.
uniform sampler2D uTexture;

// Standalone PBR maps (both indexed by vNormalizedUV).
uniform sampler2D uHeightMap;   // greyscale displacement / bump height
uniform sampler2D uRoughMap;    // r = roughness (0 = mirror, 1 = fully diffuse)

// Lighting uniforms (updated each frame from ShipLighting).
uniform vec3  uLightDir;        // normalised world-space light direction
uniform vec3  uLightColor;      // RGB light tint
uniform float uAmbient;         // ambient contribution [0..1]

// Rim / silhouette light.
uniform vec3  uRimColor;
uniform float uRimStrength;

// Faction tint applied to the albedo (replaces sprite.tint so the shader
// receives the unmodified albedo RGB from the PNG).
uniform vec3  uFactionColor;

// ── Normal derivation ─────────────────────────────────────────────────────────
// We only have a height (displacement) map, not a pre-computed normal map.
// Reconstruct the surface normal by measuring how steeply the height changes
// in X and Y using central differences over adjacent texels.

vec3 heightToNormal(vec2 uv) {
  // Texel size in UV space — needed for a consistent bump scale regardless of
  // the map resolution.
  ivec2 sz    = textureSize(uHeightMap, 0);
  vec2  texel = vec2(1.0) / vec2(float(sz.x), float(sz.y));

  float hL = texture(uHeightMap, uv + vec2(-texel.x,  0.0    )).r;
  float hR = texture(uHeightMap, uv + vec2( texel.x,  0.0    )).r;
  // PixiJS UV has Y increasing downward; invert the Y gradient so that a
  // "taller" pixel (closer to viewer) still produces an outward normal.
  float hD = texture(uHeightMap, uv + vec2( 0.0,      texel.y)).r;
  float hU = texture(uHeightMap, uv + vec2( 0.0,     -texel.y)).r;

  // Scale controls how pronounced the surface relief appears.
  const float BUMP = 5.0;
  return normalize(vec3((hL - hR) * BUMP, (hD - hU) * BUMP, 1.0));
}

void main(void) {
  // ── 1. Albedo ─────────────────────────────────────────────────────────────
  vec4 albedo = texture(uTexture, vTextureCoord);

  // Alpha-mask: discard pixels outside the sprite's transparent regions so
  // no egg-shaped rectangular glow is produced by the filter quad.
  if (albedo.a < 0.01) discard;

  // Apply faction tint to the raw albedo colour only (not its alpha).
  vec3 baseColor = albedo.rgb * uFactionColor;

  // ── 2. Surface normal (from height map) ──────────────────────────────────
  vec3 N = heightToNormal(vNormalizedUV);

  // ── 3. Roughness ──────────────────────────────────────────────────────────
  float rough = clamp(texture(uRoughMap, vNormalizedUV).r, 0.0, 1.0);
  float gloss = 1.0 - rough;

  // ── 4. Lighting vectors ───────────────────────────────────────────────────
  vec3 L = normalize(uLightDir);
  vec3 V = vec3(0.0, 0.0, 1.0);   // camera looking straight at the hull (+Z)
  vec3 H = normalize(L + V);       // Blinn-Phong half-vector

  // ── 5. Diffuse (Lambertian) ───────────────────────────────────────────────
  float NdotL = max(dot(N, L), 0.0);

  // ── 6. Specular (Blinn-Phong, roughness-modulated) ────────────────────────
  // Map perceptual gloss to a shininess exponent:
  //   rough = 1.0 (fully rough) → shininess ≈   4  (wide, dim highlight)
  //   rough = 0.0 (mirror)      → shininess ≈ 512  (razor-sharp reflection)
  float NdotH     = max(dot(N, H), 0.0);
  float shininess  = exp2(gloss * gloss * 9.0);   // 2^(0..512)
  float spec       = pow(NdotH, shininess) * gloss * 1.4;

  // ── 7. Rim / emissive edge ────────────────────────────────────────────────
  // normal.z ≈ 1 at face-on centre, ≈ 0 at silhouette edges.
  // A tight power produces a narrow bright band at the hull rim.
  float rimDot = clamp(1.0 - N.z, 0.0, 1.0);
  float rim    = pow(rimDot, 4.5) * uRimStrength;

  // ── 8. Composition ────────────────────────────────────────────────────────
  //   Final = (Ambient + Diffuse) * Albedo + Specular + Emissive
  //
  //   • (Ambient + Diffuse): unified irradiance term — albedo absorbs it.
  //   • Specular: added on top of albedo (metallic-style direct reflection).
  //   • Emissive: rim glow treated as self-emission (always visible, not
  //     scaled by albedo so the silhouette "glows" independent of texture).

  vec3 irradiance = (uAmbient + NdotL) * uLightColor;
  vec3 lit =
      irradiance * baseColor                          // (Ambient + Diffuse) * Albedo
    + spec * mix(uLightColor, vec3(1.0), gloss * 0.5) // Specular (brightens toward white for metals)
    + rim  * uRimColor;                               // Emissive rim

  finalColor = vec4(clamp(lit, 0.0, 1.8), albedo.a);
}
`;

// ── ShipMaterialFilter ────────────────────────────────────────────────────────

export class ShipMaterialFilter extends Filter {
  private _u: UniformGroup;

  constructor(
    heightSource:  TextureSource,
    roughSource:   TextureSource,
    rimColor:      [number, number, number] = [0.0, 0.85, 1.0],
    rimStrength    = 0.60,
    factionColor:  [number, number, number] = [1.0, 1.0, 1.0],
  ) {
    const u = new UniformGroup({
      uLightDir:     { value: new Float32Array([0.45, -0.62, 0.64]), type: 'vec3<f32>' },
      uLightColor:   { value: new Float32Array([1.0,  0.92,  0.78]), type: 'vec3<f32>' },
      uAmbient:      { value: 0.18,                                   type: 'f32'       },
      uRimColor:     { value: new Float32Array(rimColor),             type: 'vec3<f32>' },
      uRimStrength:  { value: rimStrength,                            type: 'f32'       },
      uFactionColor: { value: new Float32Array(factionColor),         type: 'vec3<f32>' },
    });

    super({
      glProgram: GlProgram.from({
        vertex:   MATERIAL_VERT,
        fragment: MATERIAL_FRAG,
        name:     'ship-material',
      }),
      resources: {
        materialUniforms: u,
        uHeightMap: heightSource,
        uRoughMap:  roughSource,
      },
      padding: 0,   // no padding: keeps output exactly sprite-sized, avoids border glow
    });

    this._u = u;
  }

  // ── Per-frame setters (driven by ShipLighting) ────────────────────────────

  set lightDir(v: Float32Array)    { this._u.uniforms['uLightDir']     = v; }
  set lightColor(v: Float32Array)  { this._u.uniforms['uLightColor']   = v; }
  set ambient(v: number)           { this._u.uniforms['uAmbient']      = v; }
  set rimStrength(v: number)       { this._u.uniforms['uRimStrength']  = v; }
  set factionColor(v: Float32Array){ this._u.uniforms['uFactionColor'] = v; }
}
