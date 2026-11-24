// Baked lighting for the static world (run once after the meshes are built; the sun never moves):
//   - two sun shadow maps: a detailed one over Sloane Square and its surroundings, a coarse one over
//     the whole map (trees included, alpha-tested leaves cast dappled shadows);
//   - a contact-shading map over the same detailed area, computed from a top-down height map: ground
//     and wall bases next to taller geometry (kerbs, benches, the fountain, façades) are darkened.
// At draw time this costs one or two shadow-map lookups and one texture lookup per pixel, with no
// extra passes, so it suits a standalone headset better than real-time shadow maps or screen-space AO.
import type { Lighting, Renderer } from '../engine/renderer';
import { lookAt, multiply, mat4, type Mat4 } from '../engine/math';

export interface BakeScene {
  /** Draws every static map-space mesh that should cast shadows (renderer.baking is set). */
  drawStatic(): void;
  /** Draws the trees (alpha-tested leaves) for the shadow maps. */
  drawTrees(): void;
}

/** Detailed area: Sloane Square, Peter Jones and the start of the corridors (map metres). */
export const BAKE_NEAR = { x: 150, z: -150, half: 150 };

function ortho(o: Mat4, half: number, near: number, far: number): Mat4 {
  o.fill(0);
  o[0] = 1 / half; o[5] = 1 / half; o[10] = -2 / (far - near);
  o[14] = -(far + near) / (far - near); o[15] = 1;
  return o;
}

function depthTarget(gl: WebGL2RenderingContext, size: number): { fb: WebGLFramebuffer; tex: WebGLTexture } {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, size, size);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
  gl.drawBuffers([gl.NONE]);
  gl.readBuffer(gl.NONE);
  return { fb, tex };
}

const AO_VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUV;
void main() { vUV = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

// Height from the top-down depth map; occlusion = how much of the horizon nearby geometry rises above,
// sampled on three rings (0.35, 0.9 and 2.2 m). Output: r occlusion, g+b ground height (16 bits, 0..64 m).
const AO_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform highp sampler2D uDepth;
uniform float uTexel;   // metres per texel
uniform vec3 uTop;      // camera height, depth range, unused
out vec4 outColor;
float H(vec2 uv) { return uTop.x - texture(uDepth, uv).r * uTop.y; }
void main() {
  float h0 = H(vUV);
  float occ = 0.0, n = 0.0;
  for (int ring = 0; ring < 3; ring++) {
    float r = ring == 0 ? 0.35 : ring == 1 ? 0.9 : 2.2;
    for (int k = 0; k < 10; k++) {
      float a = (float(k) + 0.5 * float(ring)) * 0.6283185;
      vec2 o = vec2(cos(a), sin(a)) * r / uTexel;
      float dh = H(vUV + o * (1.0 / float(textureSize(uDepth, 0).x))) - h0;
      occ += smoothstep(0.05, 0.9, dh / r) * (ring == 0 ? 1.0 : ring == 1 ? 0.8 : 0.5);
      n += ring == 0 ? 1.0 : ring == 1 ? 0.8 : 0.5;
    }
  }
  float ao = 1.0 - 0.62 * occ / n;
  float hv = clamp(h0 / 64.0, 0.0, 1.0) * 65535.0;
  outColor = vec4(ao, floor(hv / 256.0) / 255.0, mod(hv, 256.0) / 255.0, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'bake shader');
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'bake link');
  return p;
}

/** Renders one orthographic sun shadow map centred on (cx, cz). Expects renderer.baking and polygon offset set. */
function sunPass(r: Renderer, scene: BakeScene, cx: number, cz: number, h: number, size: number, reuse?: WebGLTexture): { tex: WebGLTexture; m: Float32Array } {
  const gl = r.gl, sun = r.sunDir;
  const view = mat4(), proj = mat4();
  let t: { fb: WebGLFramebuffer; tex: WebGLTexture };
  if (reuse) {
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, reuse, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    t = { fb, tex: reuse };
  } else t = depthTarget(gl, size);
  const D = 600;
  lookAt(view, [cx + sun[0] * D, sun[1] * D, cz + sun[2] * D], [cx, 0, cz], [0, 1, 0]);
  ortho(proj, h, 1, D * 2);
  const m = multiply(mat4(), proj, view);
  gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
  gl.viewport(0, 0, size, size);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  gl.polygonOffset(1.5, 3);
  r.setViewProj(m);
  scene.drawStatic();
  scene.drawTrees();
  r.shadowParams(t.tex);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(t.fb); // the texture is all that is kept
  return { tex: t.tex, m };
}

/**
 * Re-renders only the two sun shadow maps for the renderer's current sun direction (a lighting
 * preset change), into the existing textures: no new GPU memory, and the contact shading (which
 * doesn't depend on the sun) is kept.
 */
export function rebakeShadows(r: Renderer, scene: BakeScene, half: number, l: Lighting, area = BAKE_NEAR, sizes: BakeSizes = { near: 2048, far: 2048, ao: 1024 }): Lighting {
  const gl = r.gl;
  const vp = gl.getParameter(gl.VIEWPORT) as Int32Array;
  r.baking = true;
  gl.enable(gl.POLYGON_OFFSET_FILL);
  const n = sunPass(r, scene, area.x, area.z, area.half * 1.05, sizes.near, l.shadowN);
  const f = sunPass(r, scene, 0, 0, half * 1.2, sizes.far, l.shadowF);
  gl.disable(gl.POLYGON_OFFSET_FILL);
  gl.polygonOffset(0, 0);
  gl.viewport(vp[0], vp[1], vp[2], vp[3]);
  r.baking = false;
  const out: Lighting = { ...l, shadowMN: n.m, shadowMF: f.m };
  r.setLighting(out);
  return out;
}

export interface BakeSizes { near: number; far: number; ao: number }

/** Renders the shadow and contact-shading maps and installs them in the renderer. */
export function bakeLighting(r: Renderer, scene: BakeScene, half: number, sizes: BakeSizes = { near: 2048, far: 2048, ao: 1024 }): Lighting {
  const gl = r.gl;
  const vp = gl.getParameter(gl.VIEWPORT) as Int32Array;
  const tmp = mat4(), view = mat4(), proj = mat4();
  r.baking = true;
  gl.enable(gl.POLYGON_OFFSET_FILL);
  const nearPass = sunPass(r, scene, BAKE_NEAR.x, BAKE_NEAR.z, BAKE_NEAR.half * 1.05, sizes.near);
  const farPass = sunPass(r, scene, 0, 0, half * 1.2, sizes.far);
  // top-down height map over the detailed area (static geometry only: no tree canopies)
  const top = 120, range = 140;
  const hm = depthTarget(gl, sizes.ao);
  lookAt(view, [BAKE_NEAR.x, top, BAKE_NEAR.z], [BAKE_NEAR.x, 0, BAKE_NEAR.z], [0, 0, -1]);
  ortho(proj, BAKE_NEAR.half, 0, range);
  multiply(tmp, proj, view);
  gl.bindFramebuffer(gl.FRAMEBUFFER, hm.fb);
  gl.viewport(0, 0, sizes.ao, sizes.ao);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  gl.polygonOffset(0, 0);
  r.setViewProj(tmp);
  scene.drawStatic();
  gl.disable(gl.POLYGON_OFFSET_FILL);
  // contact shading from the height map
  const ao = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, ao);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, sizes.ao, sizes.ao);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, ao, 0);
  const prog = compile(gl, AO_VS, AO_FS);
  gl.useProgram(prog);
  const quad = gl.createBuffer()!;
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, hm.tex);
  gl.uniform1i(gl.getUniformLocation(prog, 'uDepth'), 0);
  gl.uniform1f(gl.getUniformLocation(prog, 'uTexel'), (BAKE_NEAR.half * 2) / sizes.ao);
  gl.uniform3f(gl.getUniformLocation(prog, 'uTop'), top, range, 0);
  gl.viewport(0, 0, sizes.ao, sizes.ao);
  gl.disable(gl.DEPTH_TEST);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.enable(gl.DEPTH_TEST);
  gl.bindVertexArray(null);
  // free the temporary targets
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fb);
  gl.deleteFramebuffer(hm.fb);
  gl.deleteTexture(hm.tex);
  gl.deleteBuffer(quad);
  gl.deleteVertexArray(vao);
  gl.deleteProgram(prog);
  gl.viewport(vp[0], vp[1], vp[2], vp[3]);
  r.baking = false;
  // the top-down camera looks down with up = -z: texture u grows with +x and v grows toward -z (north)
  const lighting: Lighting = {
    shadowN: nearPass.tex, shadowF: farPass.tex, shadowMN: nearPass.m, shadowMF: farPass.m,
    ao, aoRect: [BAKE_NEAR.x - BAKE_NEAR.half, BAKE_NEAR.z + BAKE_NEAR.half, 1 / (BAKE_NEAR.half * 2), 1],
  };
  r.setLighting(lighting);
  return lighting;
}
