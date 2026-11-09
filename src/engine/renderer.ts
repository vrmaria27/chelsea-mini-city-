// Tiny WebGL2 renderer: one lit vertex-colour shader and one textured (label/panel) shader.
import type { Mat4 } from './math';

const LIT_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
uniform mat4 uViewProj;
uniform mat4 uModel;
out vec3 vColor;
out vec3 vNormal;
void main() {
  vColor = aColor;
  vNormal = mat3(uModel) * aNormal;
  gl_Position = uViewProj * uModel * vec4(aPos, 1.0);
}`;

const LIT_FS = `#version 300 es
precision mediump float;
in vec3 vColor;
in vec3 vNormal;
uniform vec3 uSunDir;
uniform vec4 uTint;     // rgb, a = mix amount
uniform float uAlpha;
uniform float uUnlit;
out vec4 outColor;
void main() {
  vec3 n = normalize(vNormal);
  float sun = max(dot(n, uSunDir), 0.0);
  float sky = 0.5 + 0.5 * n.y;
  vec3 light = mix(vec3(0.50, 0.47, 0.45), vec3(0.74, 0.76, 0.80), sky) + vec3(0.52, 0.47, 0.40) * sun;
  vec3 c = mix(vColor * light, vColor, uUnlit);
  c = mix(c, uTint.rgb, uTint.a);
  outColor = vec4(c, uAlpha);
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
out vec3 vNormal;
void main() {
  float c = cos(iPosYaw.w), s = sin(iPosYaw.w);
  vec3 p = vec3(aPos.x * c + aPos.z * s, aPos.y, -aPos.x * s + aPos.z * c) + iPosYaw.xyz;
  vec3 n = vec3(aNormal.x * c + aNormal.z * s, aNormal.y, -aNormal.x * s + aNormal.z * c);
  float marker = step(0.995, min(aColor.r, min(aColor.g, aColor.b)));
  vColor = mix(aColor, iColor, marker);
  vNormal = mat3(uModel) * n;
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

export interface Mesh {
  vao: WebGLVertexArrayObject;
  buffer: WebGLBuffer;
  count: number;
  mode: number;
  kind: 'lit' | 'tex';
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
}

const NO_TINT = [0, 0, 0, 0] as const;

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private lit: Program;
  private tex: Program;
  private inst: Program;
  private viewProj: Mat4 = new Float32Array(16);
  sunDir: [number, number, number];

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: true, xrCompatible: true, alpha: false } as WebGLContextAttributes);
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.lit = this.program(LIT_VS, LIT_FS, ['uViewProj', 'uModel', 'uSunDir', 'uTint', 'uAlpha', 'uUnlit']);
    this.tex = this.program(TEX_VS, TEX_FS, ['uViewProj', 'uModel', 'uTex', 'uAlpha']);
    this.inst = this.program(INST_VS, LIT_FS, ['uViewProj', 'uModel', 'uSunDir', 'uTint', 'uAlpha', 'uUnlit']);
    const s = [0.45, 0.8, 0.4];
    const l = Math.hypot(s[0], s[1], s[2]);
    this.sunDir = [s[0] / l, s[1] / l, s[2] / l];
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
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
    const { prog, u } = this.inst;
    gl.useProgram(prog);
    gl.uniformMatrix4fv(u.uViewProj, false, this.viewProj);
    gl.uniformMatrix4fv(u.uModel, false, model);
    gl.uniform3fv(u.uSunDir, this.sunDir);
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

  drawLit(mesh: Mesh, model: Mat4, opts: DrawOptions = {}): void {
    if (!mesh.count) return;
    const gl = this.gl;
    const { prog, u } = this.lit;
    gl.useProgram(prog);
    gl.uniformMatrix4fv(u.uViewProj, false, this.viewProj);
    gl.uniformMatrix4fv(u.uModel, false, model);
    gl.uniform3fv(u.uSunDir, this.sunDir);
    gl.uniform4f(u.uTint, ...(opts.tint ?? NO_TINT));
    const alpha = opts.alpha ?? 1;
    gl.uniform1f(u.uAlpha, alpha);
    gl.uniform1f(u.uUnlit, opts.unlit ? 1 : 0);
    this.blend(alpha < 1);
    if (opts.doubleSided) gl.disable(gl.CULL_FACE);
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
