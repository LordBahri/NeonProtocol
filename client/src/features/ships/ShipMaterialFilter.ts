import { Filter, GlProgram, UniformGroup } from 'pixi.js';
import type { TextureSource } from 'pixi.js';

// Custom vertex: same as FilterVertex.ts + vNormalizedUV = aPosition (0→1 over sprite)
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
uniform sampler2D uHeightMap;   // height → normals via central diff (image 4)
uniform sampler2D uRoughMap;    // roughness / dirt map (image 1)

uniform vec3  uLightDir;        // normalized, pointing toward the light
uniform vec3  uLightColor;      // dominant light color
uniform float uAmbient;         // base ambient level (no light needed)
uniform vec3  uRimColor;        // faction rim: cyan (player) or orange (enemy)
uniform float uRimStrength;
uniform float uBumpStrength;    // height-to-normal amplification

void main(void) {
  vec4  albedo = texture(uTexture,  vTextureCoord);
  float rough  = texture(uRoughMap, vNormalizedUV).r;

  // Derive tangent-space normal from height map using central differences.
  // textureSize() is WebGL2 (GLSL 300 es) — no extra uniform needed.
  vec2  sz     = vec2(textureSize(uHeightMap, 0));
  vec2  texel  = 1.0 / sz;
  float hL = texture(uHeightMap, vNormalizedUV - vec2(texel.x, 0.0)).r;
  float hR = texture(uHeightMap, vNormalizedUV + vec2(texel.x, 0.0)).r;
  float hD = texture(uHeightMap, vNormalizedUV - vec2(0.0, texel.y)).r;
  float hU = texture(uHeightMap, vNormalizedUV + vec2(0.0, texel.y)).r;
  vec3 normal = normalize(vec3((hL - hR) * uBumpStrength, (hD - hU) * uBumpStrength, 1.0));

  // Lambert diffuse
  float NdotL = max(dot(normal, normalize(uLightDir)), 0.0);

  // Blinn-Phong specular — low roughness = sharper, brighter highlights
  float gloss = 1.0 - rough;
  vec3  halfV = normalize(uLightDir + vec3(0.0, 0.0, 1.0));
  float NdotH = max(dot(normal, halfV), 0.0);
  float spec  = pow(NdotH, 8.0 + gloss * 56.0) * gloss * 0.55;

  // Rim light — normals facing away from camera (low z) get the faction colour
  float rim   = pow(clamp(1.0 - normal.z, 0.0, 1.0), 3.5) * uRimStrength;

  // Compose: ambient + diffuse * light + specular + rim
  vec3 lit = albedo.rgb * (uAmbient + NdotL * uLightColor)
           + uLightColor * spec
           + uRimColor   * rim;

  finalColor = vec4(clamp(lit, 0.0, 2.5), albedo.a);
}
`;

export class ShipMaterialFilter extends Filter {
  private _u: UniformGroup;

  constructor(
    heightSource:  TextureSource,
    roughSource:   TextureSource,
    rimColor:      [number, number, number] = [0.0, 0.85, 1.0],
    bumpStrength   = 6.0,
    rimStrength    = 0.55,
  ) {
    const u = new UniformGroup({
      uLightDir:    { value: new Float32Array([0.45, -0.62, 0.64]), type: 'vec3<f32>' },
      uLightColor:  { value: new Float32Array([1.0,  0.92,  0.78]), type: 'vec3<f32>' },
      uAmbient:     { value: 0.35,       type: 'f32'       },
      uRimColor:    { value: new Float32Array(rimColor),            type: 'vec3<f32>' },
      uRimStrength: { value: rimStrength, type: 'f32'       },
      uBumpStrength:{ value: bumpStrength, type: 'f32'      },
    });

    super({
      glProgram: GlProgram.from({ vertex: MATERIAL_VERT, fragment: MATERIAL_FRAG, name: 'ship-material' }),
      resources: {
        materialUniforms: u,
        uHeightMap: heightSource,
        uRoughMap:  roughSource,
      },
    });

    this._u = u;
  }

  set lightDir(v: Float32Array)   { this._u.uniforms['uLightDir']    = v; }
  set lightColor(v: Float32Array) { this._u.uniforms['uLightColor']  = v; }
  set ambient(v: number)          { this._u.uniforms['uAmbient']     = v; }
  set rimStrength(v: number)      { this._u.uniforms['uRimStrength'] = v; }
  set bumpStrength(v: number)     { this._u.uniforms['uBumpStrength'] = v; }
}
