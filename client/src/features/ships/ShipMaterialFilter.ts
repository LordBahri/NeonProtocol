import { Filter, GlProgram, UniformGroup } from 'pixi.js';
import type { TextureSource } from 'pixi.js';

// Custom vertex: same as PixiJS FilterVertex + vNormalizedUV = aPosition (0→1 over sprite)
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
  gl_Position    = filterVertexPosition();
  vTextureCoord  = filterTextureCoord();
  vNormalizedUV  = aPosition;
}
`;

const MATERIAL_FRAG = /* glsl */ `
precision highp float;

in  vec2 vTextureCoord;
in  vec2 vNormalizedUV;
out vec4 finalColor;

uniform sampler2D uTexture;     // albedo — provided by PixiJS filter pipeline
uniform sampler2D uNormalMap;   // OpenGL-convention RGB normal map (image 4)
uniform sampler2D uRoughMap;    // roughness / dirt map (image 1); r=rough

uniform vec3  uLightDir;        // normalized, pointing toward the light
uniform vec3  uLightColor;
uniform float uAmbient;
uniform vec3  uRimColor;        // faction rim: cyan (player) or orange (enemy)
uniform float uRimStrength;

void main(void) {
  vec4 albedo = texture(uTexture, vTextureCoord);

  // Discard fully transparent fragments so PixiJS filter padding never produces
  // an egg-shaped border around the sprite rect.
  if (albedo.a < 0.01) discard;

  float rough = texture(uRoughMap, vNormalizedUV).r;

  // Decode tangent-space normal from OpenGL RGB normal map.
  // PixiJS UV origin is top-left (Y increases downward), but normal maps are
  // authored with +Y pointing screen-up — flip Y to match screen-space.
  vec3 normal = normalize(texture(uNormalMap, vNormalizedUV).rgb * 2.0 - 1.0);
  normal.y = -normal.y;

  vec3 L = normalize(uLightDir);
  vec3 V = vec3(0.0, 0.0, 1.0);   // camera looks along +Z toward the hull
  vec3 H = normalize(L + V);       // Blinn-Phong half-vector

  // Lambert diffuse
  float NdotL = max(dot(normal, L), 0.0);

  // Blinn-Phong specular — roughness controls tightness and amplitude.
  // gloss = 1 - rough: high-gloss surfaces get a sharp, bright highlight.
  float gloss  = 1.0 - rough;
  float NdotH  = max(dot(normal, H), 0.0);
  float spec   = pow(NdotH, 8.0 + gloss * 120.0) * gloss * 0.9;

  // Rim light — tight silhouette band (exponent 6 ≈ 2-3 px wide on hull edge).
  float rimDot = clamp(1.0 - normal.z, 0.0, 1.0);
  float rim    = pow(rimDot, 6.0) * uRimStrength;

  // Compose: Ambient + (Diffuse * Albedo) + (Specular modulated by gloss) + Rim
  vec3 ambientTerm = uAmbient   * uLightColor;
  vec3 diffuseTerm = NdotL      * uLightColor * albedo.rgb;
  vec3 specTerm    = spec       * uLightColor;
  vec3 rimTerm     = uRimColor  * rim;

  vec3 lit = ambientTerm + diffuseTerm + specTerm + rimTerm;

  finalColor = vec4(clamp(lit, 0.0, 2.0), albedo.a);
}
`;

export class ShipMaterialFilter extends Filter {
  private _u: UniformGroup;

  constructor(
    normalSource:  TextureSource,
    roughSource:   TextureSource,
    rimColor:      [number, number, number] = [0.0, 0.85, 1.0],
    rimStrength    = 0.55,
  ) {
    const u = new UniformGroup({
      uLightDir:    { value: new Float32Array([0.45, -0.62, 0.64]), type: 'vec3<f32>' },
      uLightColor:  { value: new Float32Array([1.0,  0.92,  0.78]), type: 'vec3<f32>' },
      uAmbient:     { value: 0.35,                                   type: 'f32'       },
      uRimColor:    { value: new Float32Array(rimColor),             type: 'vec3<f32>' },
      uRimStrength: { value: rimStrength,                            type: 'f32'       },
    });

    super({
      glProgram: GlProgram.from({ vertex: MATERIAL_VERT, fragment: MATERIAL_FRAG, name: 'ship-material' }),
      resources: {
        materialUniforms: u,
        uNormalMap: normalSource,
        uRoughMap:  roughSource,
      },
      padding: 0,   // no extra quad padding — prevents rectangular glow border
    });

    this._u = u;
  }

  set lightDir(v: Float32Array)   { this._u.uniforms['uLightDir']    = v; }
  set lightColor(v: Float32Array) { this._u.uniforms['uLightColor']  = v; }
  set ambient(v: number)          { this._u.uniforms['uAmbient']     = v; }
  set rimStrength(v: number)      { this._u.uniforms['uRimStrength'] = v; }
}
