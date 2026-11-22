// Small WebGL2 renderer: a lit vertex-colour shader (with surface materials), a textured label/panel
// shader and a nature shader (trees, water). Lighting is done in linear light and tone-mapped (sRGB
// vertex colours are decoded first), so shaded sides read as shade rather than as darker paint.
//
// Map-space meshes (world = true) are lit with a fixed sun in *map* space, receive baked sun shadows
// (two static shadow maps: a detailed one over Sloane Square and a coarse one over the whole map) and
// baked contact shading, and pick up tiling surface detail by material (materials.ts).
import type { Mat4 } from './math';

const SHADOW_VS = `
uniform float uShade;
uniform vec3 uSunDir;
uniform highp mat4 uShadowMN;
uniform highp mat4 uShadowMF;
uniform highp vec4 uAORect;
out highp vec3 vSN;
out highp vec3 vSF;
out highp vec2 vAOuv;
void shadowCoords(vec3 p, vec3 n) {
  // per-vertex: the shadow-map and contact-map coordinates interpolate linearly (orthographic maps)
  vSN = (uShadowMN * vec4(p + n * 0.12 + uSunDir * 0.06, 1.0)).xyz;
  vSF = (uShadowMF * vec4(p + n * 0.35 + uSunDir * 0.2, 1.0)).xyz;
  vec2 q = p.xz + n.xz * 0.3;
  vAOuv = vec2(q.x - uAORect.x, uAORect.y - q.y) * uAORect.z;
}
`;

// Lighting shared by the lit and nature shaders (linear light, map space).
const LIGHT = `
uniform vec3 uSunDir;
uniform float uExposure;
uniform float uShade;      // 1: map-space mesh (shadows, contact shading, materials)
uniform float uQuality;    // 1: surface detail textures and normal maps (off with Low detail)
uniform highp vec3 uEye;   // eye position in map space
uniform highp sampler2DShadow uShadowN;
uniform highp sampler2DShadow uShadowF;
uniform sampler2D uAO;     // r: contact occlusion, g+b: ground height (16-bit, 0..64 m)
uniform highp vec4 uAORect; // x0, z1 (north edge is v = 1), 1/size, on
in highp vec3 vSN;
in highp vec3 vSF;
in highp vec2 vAOuv;
const vec3 SUN = vec3(1.0, 0.94, 0.84) * 1.35;
vec3 lin(vec3 c) { return c * c * (c * 0.305306 + 0.682171) + c * 0.012522; }
vec3 tonemap(vec3 x) {
  x *= uExposure;
  vec3 a = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
  return sqrt(clamp(a, 0.0, 1.0)); // gamma 2.0 (cheaper than pow; exposure calibrated for it)
}
vec3 ambient(vec3 n) {
  // sky above, warm bounce from the paving below
  return mix(vec3(0.27, 0.245, 0.21), vec3(0.47, 0.50, 0.56), 0.5 + 0.5 * n.y);
}
/** Reflection environment: sky gradient, a band of dark surroundings at the horizon, paving below. */
vec3 envSky(vec3 d) {
  float h = d.y;
  vec3 zen = vec3(0.20, 0.36, 0.70), hor = vec3(0.62, 0.70, 0.80);
  vec3 s = mix(hor, zen, pow(clamp(h, 0.0, 1.0), 0.55));
  float town = smoothstep(0.22, 0.02, h) * step(-0.02, h);
  s = mix(s, vec3(0.16, 0.15, 0.14), town * 0.7);
  if (h < -0.02) s = mix(vec3(0.16, 0.15, 0.14), vec3(0.24, 0.22, 0.19), min(1.0, -h * 3.0));
  return s;
}
float shadowAt() {
  if (uShade < 0.5) return 1.0;
  float ea = max(abs(vSN.x), abs(vSN.y));
  if (ea < 0.985) return texture(uShadowN, vSN * 0.5 + vec3(0.5, 0.5, 0.4998));
  if (max(abs(vSF.x), abs(vSF.y)) > 0.99) return 1.0;
  return texture(uShadowF, vSF * 0.5 + vec3(0.5, 0.5, 0.4995));
}
/** Baked contact shading near the ground (Sloane Square area). */
float aoAt(highp vec3 p) {
  if (uShade < 0.5 || uAORect.w < 0.5) return 1.0;
  if (vAOuv.x < 0.0 || vAOuv.y < 0.0 || vAOuv.x > 1.0 || vAOuv.y > 1.0) return 1.0;
  vec4 t = texture(uAO, vAOuv);
  float hg = (t.g * 65280.0 + t.b * 255.0) * (64.0 / 65535.0);
  // full effect on the ground and the foot of walls, fading out 1.6 m above the ground
  return mix(t.r, 1.0, smoothstep(0.15, 1.6, p.y - hg));
}
`;

const LIT_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
uniform mat4 uViewProj;
uniform mat4 uModel;
out vec3 vColor;
out vec3 vN;
out highp vec3 vPos;
out vec3 vLin;
flat out int vMat;
${SHADOW_VS}
void main() {
  float k = length(aNormal);
  vMat = int(k + 0.5) - 1;
  vColor = aColor;
  vLin = aColor * aColor * (aColor * 0.305306 + 0.682171) + aColor * 0.012522;
  vN = aNormal / k;
  vPos = aPos;
  if (uShade > 0.5) shadowCoords(aPos, vN);
  gl_Position = uViewProj * uModel * vec4(aPos, 1.0);
}`;

const LIT_FS = `#version 300 es
precision highp float;
precision highp sampler2DArray;
in vec3 vColor;
in vec3 vN;
in highp vec3 vPos;
in vec3 vLin;
flat in int vMat;
uniform vec4 uTint;     // rgb, a = mix amount
uniform float uAlpha;
uniform float uUnlit;
uniform sampler2DArray uDetail;  // per layer: albedo / mean × 0.5
uniform sampler2DArray uSurf;    // per layer: normal xy, roughness
uniform highp vec4 uPJ;          // Peter Jones glazing: storey base, storey height, glass bottom within storey, glass top
out vec4 outColor;
${LIGHT}
float hash12(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
void main() {
  if (uUnlit > 0.5) { outColor = vec4(mix(vColor, uTint.rgb, uTint.a), uAlpha); return; }
  vec3 n = normalize(vN);
  vec3 alb = vLin;
  int m = vMat;
  float rough = 0.85, f0 = 0.035, metal = 0.0;
  vec3 V = normalize(uEye - vPos);
  // ---- surface detail: planar projection (walls: along the wall and up; ground: plan) ----
  if (uShade > 0.5 && uQuality > 0.5 && m >= 1 && m <= 7) {
    float layer = 0.0, scale = 2.5, str = 1.0, chroma = 0.3, nstr = 0.5;
    if (m == 1) { layer = 0.0; scale = 2.5; str = 0.95; chroma = 0.35; nstr = 0.55; }
    else if (m == 2) { layer = 0.0; scale = 2.5; str = 0.8; chroma = 0.06; nstr = 0.55; }
    else if (m == 3) { layer = 2.0; scale = 3.5; str = 0.2; chroma = 0.2; nstr = 0.18; rough = 0.8; }
    else if (m == 4) { layer = 2.0; scale = 5.0; str = 0.1; chroma = 0.1; nstr = 0.08; rough = 0.7; }
    else if (m == 5) { layer = 2.0; scale = 2.2; str = 0.42; chroma = 0.25; nstr = 0.35; }
    else if (m == 6) { layer = 3.0; scale = 3.0; str = 0.5; chroma = 0.15; nstr = 0.35; rough = 0.92; alb *= 0.62; }
    else if (m == 7) { layer = 2.0; scale = 1.6; str = 0.3; chroma = 0.2; nstr = 0.25; rough = 0.75; }
    vec2 uv; vec3 T, B;
    if (abs(n.y) > 0.6) { uv = vPos.xz; T = vec3(1.0, 0.0, 0.0); B = vec3(0.0, 0.0, 1.0); }
    else { vec2 t = normalize(vec2(-n.z, n.x)); uv = vec2(dot(vPos.xz, t), -vPos.y); T = vec3(t.x, 0.0, t.y); B = vec3(0.0, -1.0, 0.0); }
    uv /= scale;
    vec3 d = texture(uDetail, vec3(uv, layer)).rgb * 2.0;
    float l = dot(d, vec3(0.3, 0.59, 0.11));
    alb *= mix(vec3(1.0), mix(vec3(l), d, chroma), str);
    vec3 s = texture(uSurf, vec3(uv, layer)).rgb;
    vec2 nn = (s.rg * 2.0 - 1.0) * nstr;
    n = normalize(n + T * nn.x - B * nn.y);
    rough = mix(rough, 0.55 + 0.45 * s.b, 0.6);
  }
  if (m == 8) { rough = 0.38; f0 = 0.05; }
  if (m == 9) { rough = 0.42; metal = 0.85; }
  if (m == 13) { rough = 0.25; f0 = 0.05; }
  float sh = shadowAt();
  float ao = aoAt(vPos);
  float ndl = max(dot(n, uSunDir), 0.0);
  vec3 col;
  if (m == 10 || m == 11 || m == 14) {
    // glass: sky / surroundings reflection over a dark interior, Fresnel-weighted
    float nv = max(dot(n, V), 0.0);
    vec3 r = reflect(-V, n);
    vec3 env = envSky(r);
    float fres = 0.07 + 0.93 * pow(1.0 - nv, 5.0);
    vec3 inside = alb * 0.22;
    if (m == 11) {
      // Peter Jones: interior impression — ceiling soffits and lit ceiling band seen through the pane,
      // offset with the view direction as if 2.5 m deep; per-pane variation from the vertex tint
      float depth = 2.4;
      float yIn = vPos.y - V.y / max(0.25, nv) * depth;
      float f = fract((yIn - uPJ.x) / uPJ.y);
      float ceil = smoothstep(0.86, 0.95, f) * (1.0 - smoothstep(0.97, 1.0, f));
      float blind = clamp((dot(alb, vec3(0.33)) - 0.14) * 4.0, 0.0, 1.0);
      inside = mix(vec3(0.010, 0.012, 0.014), vec3(0.06, 0.058, 0.05), 0.35 + 0.65 * blind) + vec3(0.24, 0.22, 0.18) * ceil * 0.6;
      fres = max(fres, 0.22 + 0.1 * blind);
      env *= 0.92 + 0.16 * hash12(floor(vec2(dot(vPos.xz, normalize(vec2(-n.z, n.x))) / 0.965, vPos.y / 3.735)));
    } else if (m == 14) {
      // lit window display about 1.2 m behind the glass: a bright band of merchandise between a dark
      // floor and ceiling, shifted with the viewing angle (vertex tint varies it per bay)
      float yIn = vPos.y - V.y / max(0.3, nv) * 1.2;
      float band = smoothstep(0.55, 0.95, yIn) * (1.0 - smoothstep(2.7, 3.2, yIn));
      inside = mix(vec3(0.012, 0.012, 0.014), alb * 1.1, band * 0.85) + vec3(0.18, 0.16, 0.12) * smoothstep(3.1, 3.4, yIn) * (1.0 - smoothstep(3.45, 3.55, yIn));
      fres = max(fres, 0.1);
    } else fres = max(fres, 0.12);
    col = mix(inside, env * ao, fres);
    vec3 h = normalize(uSunDir + V);
    col += SUN * pow(max(dot(n, h), 0.0), 380.0) * 0.9 * sh;
  } else if (m == 12) {
    col = alb * 1.15;
  } else if (m < 8) {
    // rough surfaces: diffuse only (their specular is negligible; saves the per-pixel cost)
    col = alb * (ambient(n) * ao + SUN * ndl * sh);
  } else {
    vec3 diff = alb * (ambient(n) * ao + SUN * ndl * sh);
    // specular: normalised Blinn-Phong with roughness, plus a restrained environment reflection
    vec3 h = normalize(uSunDir + V);
    float sp = exp2(10.0 * (1.0 - rough) + 1.0);
    float nv = max(dot(n, V), 0.0);
    vec3 F = mix(vec3(f0), alb, metal) + (1.0 - mix(vec3(f0), alb, metal)) * pow(1.0 - nv, 5.0) * (1.0 - rough);
    vec3 spec = F * (sp + 8.0) / 25.0 * pow(max(dot(n, h), 0.0), sp) * SUN * ndl * sh;
    vec3 refl = envSky(reflect(-V, n)) * F * (1.0 - rough) * ao;
    col = diff * (1.0 - metal * 0.85) + spec + refl;
  }
  col = tonemap(col);
  outColor = vec4(mix(col, uTint.rgb, uTint.a), uAlpha);
}`;

// Instanced variant: per-instance position + yaw (vec4) and colour (vec3). Vertices whose
// colour is pure white take the instance colour (clothing / car paint); others keep theirs.
const INST_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
layout(location=3) in vec4 iPosYaw;
layout(location=4) in vec3 iColor;
uniform mat4 uViewProj;
uniform mat4 uModel;
out vec3 vColor;
out vec3 vN;
out highp vec3 vPos;
out vec3 vLin;
flat out int vMat;
${SHADOW_VS}
void main() {
  float c = cos(iPosYaw.w), s = sin(iPosYaw.w);
  vec3 p = vec3(aPos.x * c + aPos.z * s, aPos.y, -aPos.x * s + aPos.z * c) + iPosYaw.xyz;
  vec3 n = vec3(aNormal.x * c + aNormal.z * s, aNormal.y, -aNormal.x * s + aNormal.z * c);
  float marker = step(0.995, min(aColor.r, min(aColor.g, aColor.b)));
  float k = length(n);
  vMat = int(k + 0.5) - 1;
  vColor = mix(aColor, iColor, marker);
  vN = n / k;
  vPos = p;
  vLin = vColor * vColor;
  if (uShade > 0.5) shadowCoords(p, vN);
  gl_Position = uViewProj * uModel * vec4(p, 1.0);
}`;

const TEX_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
uniform mat4 uViewProj;
uniform mat4 uModel;
out vec2 vUV;
void main() {
  vUV = aUV;
  gl_Position = uViewProj * uModel * vec4(aPos, 1.0);
}`;

const TEX_FS = `#version 300 es
precision mediump float;
in vec2 vUV;
uniform sampler2D uTex;
uniform float uAlpha;
out vec4 outColor;
void main() {
  vec4 c = texture(uTex, vUV);
  if (c.a < 0.03) discard;
  outColor = vec4(c.rgb, c.a * uAlpha);
}`;

// Nature shader: trees (vertex-coloured clumps or alpha-tested leaf cards), water and fountain jets.
// Vertex layout: pos3, normal3, colour3, extra4 = (u, v, sway weight 0..1, phase); u = -1 marks bark.
// Sway moves only vertices with weight > 0 (twigs and leaves), with a per-tree phase, so trunks stay
// still and neighbouring trees never move in step. uSway = 0 turns all motion off (reduced motion).
const NATURE_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
layout(location=3) in vec4 aExtra;
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform highp float uTime;
uniform float uSway;
out vec3 vColor;
out vec3 vN;
out vec4 vExtra;
out highp vec3 vPos;
${SHADOW_VS}
void main() {
  vec3 p = aPos;
  float w = aExtra.z * uSway;
  float ph = aExtra.w;
  float slow = sin(uTime * 0.9 + ph) + 0.35 * sin(uTime * 2.3 + ph * 1.7);
  float flutter = sin(uTime * 6.1 + ph * 9.0 + aPos.y * 1.3) * 0.25;
  p.x += w * (0.16 * slow + 0.05 * flutter);
  p.z += w * (0.11 * cos(uTime * 0.77 + ph * 1.3) + 0.05 * flutter);
  p.y += w * 0.04 * flutter;
  vColor = aColor;
  vN = aNormal;
  vExtra = aExtra;
  vPos = p;
  if (uShade > 0.5) shadowCoords(p, normalize(aNormal));
  gl_Position = uViewProj * uModel * vec4(p, 1.0);
}`;

const NATURE_FS = `#version 300 es
precision highp float;
precision highp sampler2DArray;
uniform highp float uTime;
in vec3 vColor;
in vec3 vN;
in vec4 vExtra;
in highp vec3 vPos;
uniform int uMode;        // 0 clumps / bark, 1 leaf cards (alpha-tested), 2 water, 3/4 overdraw count, 5 falling water
uniform sampler2D uTex;
uniform sampler2DArray uDetail;
uniform sampler2DArray uSurf;
uniform float uA2C;       // 1 when alpha-to-coverage is enabled (sharpened alpha), else 0 (hard test)
uniform float uDepthOnly; // shadow bake: alpha test only
out vec4 outColor;
${LIGHT}
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5), b = fract(sin(dot(i + vec2(1, 0), vec2(127.1, 311.7))) * 43758.5);
  float c = fract(sin(dot(i + vec2(0, 1), vec2(127.1, 311.7))) * 43758.5), d = fract(sin(dot(i + vec2(1, 1), vec2(127.1, 311.7))) * 43758.5);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
void main() {
  vec3 n = normalize(vN);
  if (uMode == 4) { outColor = vec4(1.0 / 64.0, 0.0, 0.0, 1.0); return; }
  vec3 V = normalize(uEye - vPos);
  if (uMode == 2) {
    // pool: wind ripples and rings spreading from the falling water, sky reflection with Fresnel,
    // the tiled floor seen through it
    vec2 q = vPos.xz;
    vec2 g = vec2(sin(q.x * 3.1 + uTime * 1.6) * cos(q.y * 2.7 - uTime * 1.2), cos(q.x * 2.3 - uTime * 1.1) * sin(q.y * 3.4 + uTime * 1.5)) * 0.05;
    g += vec2(sin(q.x * 9.0 + q.y * 7.0 - uTime * 4.0), cos(q.x * 8.0 - q.y * 9.5 - uTime * 3.6)) * 0.018;
    // rings spreading from where the overflow streams land (about 1.05 m from the fountain's axis)
    float rc = length(vExtra.xy);
    if (rc > 0.9) {
      float ring = sin((rc - 1.05) * 26.0 - uTime * 7.0) * exp(-max(0.0, rc - 1.05) * 2.2) * smoothstep(0.92, 1.05, rc);
      g += normalize(vExtra.xy) * ring * 0.09;
    }
    vec3 wn = normalize(vec3(g.x, 1.0, g.y));
    float nv = max(dot(wn, V), 0.0);
    float fres = 0.03 + 0.97 * pow(1.0 - nv, 5.0);
    vec3 refl = envSky(reflect(-V, wn));
    vec3 body = lin(vColor) * (ambient(wn) * 0.6 + SUN * 0.35 * shadowAt());
    vec3 h = normalize(uSunDir + V);
    vec3 c = mix(body, refl, clamp(fres + 0.15, 0.0, 1.0)) + SUN * pow(max(dot(wn, h), 0.0), 600.0) * 1.6 * shadowAt();
    outColor = vec4(tonemap(c), 0.82 + 0.15 * fres);
    return;
  }
  if (uMode == 5) {
    // falling water: thin translucent streams, brighter edges, streaks moving downward (v = along the fall)
    float along = vExtra.y, across = vExtra.x;
    float streak = vnoise(vec2(across * 7.0, along * 6.0 - uTime * 5.0)) * 0.6 + vnoise(vec2(across * 19.0, along * 15.0 - uTime * 9.0)) * 0.4;
    float edge = 1.0 - abs(fract(across) * 2.0 - 1.0);
    float nv = abs(dot(n, V));
    float fres = 0.05 + 0.95 * pow(1.0 - nv, 4.0);
    vec3 refl = envSky(reflect(-V, n * sign(dot(n, V) + 1e-4)));
    vec3 c = mix(vec3(0.20, 0.27, 0.29), refl * 1.2, 0.45 + 0.5 * fres) + vec3(0.6) * smoothstep(0.62, 0.95, streak) * 0.5;
    float a = clamp(0.1 + 0.36 * streak * smoothstep(0.0, 0.35, edge) + 0.3 * fres, 0.0, 0.65) * vColor.r * smoothstep(0.0, 0.25, edge);
    outColor = vec4(tonemap(c), a);
    return;
  }
  float a = 1.0;
  vec3 base = vColor * vColor;
  if (uMode == 1 || uMode == 3) {
    vec4 t = texture(uTex, vExtra.xy);
    if (uA2C > 0.5 && uDepthOnly < 0.5) {
      a = clamp((t.a - 0.45) / max(fwidth(t.a), 0.0001) + 0.5, 0.0, 1.0);
      if (a < 0.02) discard;
    } else if (t.a < 0.5) discard;
    base *= lin(t.rgb);
    if (!gl_FrontFacing) n = -n;
  }
  if (uDepthOnly > 0.5) { outColor = vec4(0.0); return; }
  if (uMode == 3) { outColor = vec4(1.0 / 64.0, 0.0, 0.0, 1.0); return; }
  if (uMode == 0 && vExtra.x < -0.5 && uQuality > 0.5) {
    // bark: fine relief from the bark texture, plane-tree flaking as broad pale/olive patches
    vec2 t = normalize(vec2(-n.z, n.x) + 1e-4);
    vec2 uv = vec2(dot(vPos.xz, t) * 1.6, vPos.y * 0.9);
    vec3 d = texture(uDetail, vec3(uv, 4.0)).rgb * 2.0;
    base *= mix(vec3(1.0), vec3(dot(d, vec3(0.3, 0.59, 0.11))), 0.35);
    float patchN = vnoise(vec2(dot(vPos.xz, t) * 2.2, vPos.y * 1.3)) + 0.5 * vnoise(vec2(dot(vPos.xz, t) * 5.0, vPos.y * 3.1));
    base *= mix(vec3(0.82, 0.84, 0.74), vec3(1.25, 1.18, 1.0), smoothstep(0.75, 1.05, patchN));
    vec2 sn = (texture(uSurf, vec3(uv, 4.0)).rg * 2.0 - 1.0) * 0.45;
    n = normalize(n + vec3(t.x, 0.0, t.y) * sn.x + vec3(0.0, 1.0, 0.0) * sn.y);
  }
  // leaf cards with Low detail: no shadow lookup (the most overdrawn layer)
  float sh = (uMode == 1 && uQuality < 0.5) ? 1.0 : shadowAt();
  float ndl = max(dot(n, uSunDir), 0.0);
  // foliage: cheap translucency where the sun is behind the leaves
  float trans = uMode == 0 ? (vExtra.x < -0.5 ? 0.0 : 0.5) : 1.0;
  vec3 l = ambient(n) * 0.9 + SUN * ndl * sh + SUN * 0.22 * trans * max(dot(-n, uSunDir), 0.0) * sh * vec3(0.8, 1.0, 0.45);
  outColor = vec4(tonemap(base * l), a);
}`;

export interface NatureDraw {
  mode: 0 | 1 | 2 | 3 | 4 | 5;
  time: number;
  sway: number;
  texture?: WebGLTexture;
  /** Overdraw modes only: keep the depth test (counts fragments that pass it, in submission order). */
  depth?: boolean;
  doubleSided?: boolean;
  /** Map-space mesh: receives shadows (default true). */
  world?: boolean;
}

export interface Mesh {
  vao: WebGLVertexArrayObject;
  buffer: WebGLBuffer;
  count: number;
  mode: number;
  kind: 'lit' | 'tex' | 'nature';
}

export interface InstancedMesh {
  vao: WebGLVertexArrayObject;
  count: number;
  instanceBuffer: WebGLBuffer;
  instances: number;
  max: number;
}

interface Program {
  prog: WebGLProgram;
  u: Record<string, WebGLUniformLocation | null>;
}

export interface DrawOptions {
  tint?: readonly [number, number, number, number];
  alpha?: number;
  unlit?: boolean;
  doubleSided?: boolean;
  /** Draw on top of everything (ignore depth). */
  overlay?: boolean;
  /** Map-space mesh: shadows, contact shading and surface materials. */
  world?: boolean;
}

/** Baked lighting inputs (see ExplorerScene.bakeLighting). */
export interface Lighting {
  shadowN: WebGLTexture;
  shadowF: WebGLTexture;
  shadowMN: Float32Array;
  shadowMF: Float32Array;
  ao: WebGLTexture;
  aoRect: [number, number, number, number];
}

const NO_TINT = [0, 0, 0, 0] as const;
const SHADE_UNIFORMS = ['uSunDir', 'uExposure', 'uShade', 'uQuality', 'uEye', 'uShadowN', 'uShadowF', 'uShadowMN', 'uShadowMF', 'uAO', 'uAORect', 'uDetail', 'uSurf'];
const IDENT = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
/** Texture units: 0 per-draw, 1–2 shadow maps, 3 contact shading, 4–5 material arrays. */
const U_SHN = 1, U_SHF = 2, U_AO = 3, U_DET = 4, U_SURF = 5;

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private lit: Program;
  private tex: Program;
  private inst: Program;
  /** One nature program per mode (the mode is a compile-time constant: no per-pixel branching on it). */
  private natures: Program[];
  /** True when the default framebuffer is multisampled (alpha-to-coverage then softens leaf edges). */
  msaa = false;
  private viewProj: Mat4 = new Float32Array(16);
  /** Direction to the sun in map space. */
  sunDir: [number, number, number];
  exposure = 1.0;
  /** Surface detail textures and normal maps (off with Low detail). */
  quality = 1;
  /** Eye position in map space (specular highlights and reflections). */
  readonly eye = new Float32Array([0, 1.6, 0]);
  private lighting: Lighting | null = null;
  private dummyShadow: WebGLTexture;
  private dummyAO: WebGLTexture;
  private detail: WebGLTexture;
  private surf: WebGLTexture;
  /** While baking, shading textures are unbound (a texture can't be read while it is being rendered). */
  baking = false;

  constructor(readonly canvas: HTMLCanvasElement | OffscreenCanvas) {
    const gl = canvas.getContext('webgl2', { antialias: true, xrCompatible: true, alpha: false } as WebGLContextAttributes) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.lit = this.program(LIT_VS, LIT_FS, ['uViewProj', 'uModel', 'uTint', 'uAlpha', 'uUnlit', 'uPJ', ...SHADE_UNIFORMS]);
    this.tex = this.program(TEX_VS, TEX_FS, ['uViewProj', 'uModel', 'uTex', 'uAlpha']);
    this.inst = this.program(INST_VS, LIT_FS, ['uViewProj', 'uModel', 'uTint', 'uAlpha', 'uUnlit', 'uPJ', ...SHADE_UNIFORMS]);
    this.natures = [0, 1, 2, 3, 4, 5].map((m) => this.program(NATURE_VS, NATURE_FS.replace('uniform int uMode;', `const int uMode = ${m};`), ['uViewProj', 'uModel', 'uTime', 'uSway', 'uTex', 'uA2C', 'uDepthOnly', ...SHADE_UNIFORMS]));
    this.msaa = (gl.getParameter(gl.SAMPLES) as number) > 1;
    // morning sun from the south-east, about 50° high (lights Peter Jones' Sloane Square front)
    const s = [0.5, 0.82, 0.42];
    const l = Math.hypot(s[0], s[1], s[2]);
    this.sunDir = [s[0] / l, s[1] / l, s[2] / l];
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    // placeholders until the baked lighting and the material textures are ready
    this.dummyShadow = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.dummyShadow);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, 1, 1, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, new Uint32Array([0xffffffff]));
    this.shadowParams(this.dummyShadow);
    this.dummyAO = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.dummyAO);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 0, 0, 255]));
    this.detail = this.flatArray([128, 128, 128, 255]);
    this.surf = this.flatArray([128, 128, 200, 255]);
  }

  private flatArray(px: number[]): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
    const n = 5;
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, 1, 1, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(Array.from({ length: n }, () => px).flat()));
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return t;
  }

  /** Material texture arrays from vertical strips of square layers (public/tex/*.jpg). */
  setMaterialTextures(detail: TexImageSource & { width: number; height: number }, surf: TexImageSource & { width: number; height: number }): void {
    const gl = this.gl;
    const load = (img: TexImageSource & { width: number; height: number }) => {
      const t = gl.createTexture()!;
      const size = img.width, layers = Math.round(img.height / img.width);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, size, size, layers, 0, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
      const ext = gl.getExtension('EXT_texture_filter_anisotropic');
      if (ext) gl.texParameterf(gl.TEXTURE_2D_ARRAY, ext.TEXTURE_MAX_ANISOTROPY_EXT, 4);
      return t;
    };
    this.detail = load(detail);
    this.surf = load(surf);
  }

  shadowParams(t: WebGLTexture): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  }

  setLighting(l: Lighting | null): void {
    this.lighting = l;
  }

  get hasLighting(): boolean {
    return this.lighting !== null;
  }

  /** Binds the shared shading textures and uniforms for a program. */
  private shading(p: Program, world: boolean): void {
    const gl = this.gl, u = p.u, L = this.baking ? null : this.lighting;
    gl.uniform3fv(u.uSunDir, this.sunDir);
    gl.uniform1f(u.uExposure, this.exposure);
    gl.uniform1f(u.uShade, world && L ? 1 : 0);
    gl.uniform1f(u.uQuality, this.quality);
    gl.uniform3fv(u.uEye, this.eye);
    gl.activeTexture(gl.TEXTURE0 + U_SHN); gl.bindTexture(gl.TEXTURE_2D, L?.shadowN ?? this.dummyShadow);
    gl.activeTexture(gl.TEXTURE0 + U_SHF); gl.bindTexture(gl.TEXTURE_2D, L?.shadowF ?? this.dummyShadow);
    gl.activeTexture(gl.TEXTURE0 + U_AO); gl.bindTexture(gl.TEXTURE_2D, L?.ao ?? this.dummyAO);
    gl.activeTexture(gl.TEXTURE0 + U_DET); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.detail);
    gl.activeTexture(gl.TEXTURE0 + U_SURF); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.surf);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(u.uShadowN, U_SHN); gl.uniform1i(u.uShadowF, U_SHF); gl.uniform1i(u.uAO, U_AO);
    gl.uniform1i(u.uDetail, U_DET); gl.uniform1i(u.uSurf, U_SURF);
    gl.uniformMatrix4fv(u.uShadowMN, false, L?.shadowMN ?? IDENT);
    gl.uniformMatrix4fv(u.uShadowMF, false, L?.shadowMF ?? IDENT);
    const r = L?.aoRect ?? [0, 0, 1, 0];
    gl.uniform4f(u.uAORect, r[0], r[1], r[2], r[3]);
  }

  private program(vs: string, fs: string, uniforms: string[]): Program {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader error');
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link error');
    const u: Program['u'] = {};
    for (const name of uniforms) u[name] = gl.getUniformLocation(prog, name);
    return { prog, u };
  }

  /** Creates (or refills) a lit mesh from interleaved [pos3, normal3, color3] data. */
  litMesh(data: Float32Array, existing?: Mesh, mode?: number): Mesh {
    return this.mesh(data, 9, [3, 3, 3], 'lit', existing, mode);
  }

  /** Creates a textured mesh from interleaved [pos3, uv2] data. */
  texMesh(data: Float32Array, existing?: Mesh): Mesh {
    return this.mesh(data, 5, [3, 2], 'tex', existing);
  }

  private mesh(data: Float32Array, stride: number, sizes: number[], kind: Mesh['kind'], existing?: Mesh, mode?: number): Mesh {
    const gl = this.gl;
    if (existing) {
      gl.bindBuffer(gl.ARRAY_BUFFER, existing.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      existing.count = data.length / stride;
      return existing;
    }
    const vao = gl.createVertexArray()!;
    const buffer = gl.createBuffer()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    let off = 0;
    sizes.forEach((size, i) => {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, size, gl.FLOAT, false, stride * 4, off * 4);
      off += size;
    });
    gl.bindVertexArray(null);
    return { vao, buffer, count: data.length / stride, mode: mode ?? gl.TRIANGLES, kind };
  }

  /** Creates a nature mesh from interleaved [pos3, normal3, colour3, extra4] data. */
  natureMesh(data: Float32Array): Mesh {
    return this.mesh(data, 13, [3, 3, 3, 4], 'nature');
  }

  drawNature(mesh: Mesh, model: Mat4, o: NatureDraw): void {
    if (!mesh.count) return;
    const gl = this.gl;
    const p = this.natures[o.mode], { prog, u } = p;
    gl.useProgram(prog);
    gl.uniformMatrix4fv(u.uViewProj, false, this.viewProj);
    gl.uniformMatrix4fv(u.uModel, false, model);
    this.shading(p, o.world !== false);
    gl.uniform1f(u.uTime, o.time);
    gl.uniform1f(u.uSway, o.sway);
    gl.uniform1f(u.uDepthOnly, this.baking ? 1 : 0);
    const a2c = o.mode === 1 && this.msaa && !this.baking;
    gl.uniform1f(u.uA2C, a2c ? 1 : 0);
    if (o.texture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, o.texture);
      gl.uniform1i(u.uTex, 0);
    }
    if (o.mode === 2 || o.mode === 5) this.blend(true);
    if (o.mode === 3 || o.mode === 4) { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); if (!o.depth) gl.disable(gl.DEPTH_TEST); }
    if (a2c) gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    if (o.doubleSided || o.mode === 5 || this.baking) gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(mesh.vao);
    gl.drawArrays(mesh.mode, 0, mesh.count);
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.blend(false);
  }

  /** Base geometry ([pos3, normal3, color3]) drawn many times; instance data is [x, y, z, yaw, r, g, b]. */
  instancedMesh(base: Float32Array, max: number): InstancedMesh {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, base, gl.STATIC_DRAW);
    [3, 3, 3].reduce((off, size, i) => {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, size, gl.FLOAT, false, 36, off * 4);
      return off + size;
    }, 0);
    const ib = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, ib);
    gl.bufferData(gl.ARRAY_BUFFER, max * 7 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 28, 0);
    gl.vertexAttribDivisor(3, 1);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 3, gl.FLOAT, false, 28, 16);
    gl.vertexAttribDivisor(4, 1);
    gl.bindVertexArray(null);
    return { vao, count: base.length / 9, instanceBuffer: ib, instances: 0, max };
  }

  updateInstances(mesh: InstancedMesh, data: Float32Array, instances: number): void {
    const gl = this.gl;
    mesh.instances = Math.min(instances, mesh.max);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.instanceBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, mesh.instances * 7);
  }

  drawInstanced(mesh: InstancedMesh, model: Mat4): void {
    if (!mesh.instances) return;
    const gl = this.gl;
    const p = this.inst, { prog, u } = p;
    gl.useProgram(prog);
    gl.uniformMatrix4fv(u.uViewProj, false, this.viewProj);
    gl.uniformMatrix4fv(u.uModel, false, model);
    this.shading(p, true);
    gl.uniform4f(u.uTint, 0, 0, 0, 0);
    gl.uniform1f(u.uAlpha, 1);
    gl.uniform1f(u.uUnlit, 0);
    gl.bindVertexArray(mesh.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.count, mesh.instances);
  }

  createTexture(source: TexImageSource): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.updateTexture(t, source);
    return t;
  }

  updateTexture(t: WebGLTexture, source: TexImageSource): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  setViewProj(m: Mat4): void {
    this.viewProj.set(m);
  }

  /** Peter Jones glazing constants: storey base and height, and the glass band within the storey. */
  pj = new Float32Array([5.8, 3.735, 1.245, 3.735]);

  drawLit(mesh: Mesh, model: Mat4, opts: DrawOptions = {}): void {
    if (!mesh.count) return;
    const gl = this.gl;
    const p = this.lit, { prog, u } = p;
    gl.useProgram(prog);
    gl.uniformMatrix4fv(u.uViewProj, false, this.viewProj);
    gl.uniformMatrix4fv(u.uModel, false, model);
    this.shading(p, !!opts.world);
    gl.uniform4fv(u.uPJ, this.pj);
    gl.uniform4f(u.uTint, ...(opts.tint ?? NO_TINT));
    const alpha = opts.alpha ?? 1;
    gl.uniform1f(u.uAlpha, alpha);
    gl.uniform1f(u.uUnlit, opts.unlit ? 1 : 0);
    this.blend(alpha < 1);
    if (opts.doubleSided || this.baking) gl.disable(gl.CULL_FACE);
    if (opts.overlay) gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(mesh.vao);
    gl.drawArrays(mesh.mode, 0, mesh.count);
    this.blend(false);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
  }

  drawTex(mesh: Mesh, model: Mat4, texture: WebGLTexture, alpha = 1, overlay = false): void {
    if (!mesh.count) return;
    const gl = this.gl;
    const { prog, u } = this.tex;
    gl.useProgram(prog);
    gl.uniformMatrix4fv(u.uViewProj, false, this.viewProj);
    gl.uniformMatrix4fv(u.uModel, false, model);
    gl.uniform1f(u.uAlpha, alpha);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(u.uTex, 0);
    this.blend(true);
    if (overlay) gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(mesh.vao);
    gl.drawArrays(mesh.mode, 0, mesh.count);
    this.blend(false);
    gl.enable(gl.DEPTH_TEST);
  }

  private blend(on: boolean): void {
    const gl = this.gl;
    if (on) {
      gl.enable(gl.BLEND);
      gl.depthMask(false);
    } else {
      gl.disable(gl.BLEND);
      gl.depthMask(true);
    }
  }
}
