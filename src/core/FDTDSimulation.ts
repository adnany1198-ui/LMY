/**
 * FDTDSimulation — GPU-resident 2D acoustic wave solver.
 *
 * Pipeline per timestep:
 *   1. fdtdProgram: read p(t), p(t-1), boundaries → write p(t+1) into temp texture.
 *   2. sourceProgram: read temp → write temp (adds source excitation) — ping-ponged
 *      into the next slot.
 *   3. Rotate slots so that what was p(t+1) becomes the new p(t).
 *
 * State textures use RGBA16F (broadly supported renderable float format with
 * the EXT_color_buffer_float extension). Pressure lives in the red channel.
 */

import { FDTD_STEP_FRAG } from "./shaders/fdtd-step.frag";
import { SOURCE_INJECT_FRAG } from "./shaders/source-inject.frag";
import { RENDER_FRAG } from "./shaders/render.frag";
import { FULLSCREEN_VERT } from "./shaders/fullscreen.vert";
import type { Grid } from "./Grid";
import { Source, waveformId } from "./Source";

export type ColorMap = "spectral" | "thermal" | "mono" | "dark";

const MAX_SOURCES = 32;

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("createShader failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? "unknown";
    gl.deleteShader(sh);
    throw new Error(`Shader compile error:\n${log}\n---\n${src}`);
  }
  return sh;
}

function linkProgram(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram {
  const p = gl.createProgram();
  if (!p) throw new Error("createProgram failed");
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p) ?? "unknown";
    gl.deleteProgram(p);
    throw new Error(`Program link error: ${log}`);
  }
  return p;
}

interface StateTexture {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
}

function createStateTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): StateTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error("createTexture failed");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const fbo = gl.createFramebuffer();
  if (!fbo) throw new Error("createFramebuffer failed");
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`Framebuffer incomplete: 0x${status.toString(16)}`);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return { texture: tex, framebuffer: fbo };
}

function createBoundaryTexture(gl: WebGL2RenderingContext, w: number, h: number): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error("createTexture failed");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RG8,
    w,
    h,
    0,
    gl.RG,
    gl.UNSIGNED_BYTE,
    new Uint8Array(w * h * 2),
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

export interface FDTDSimulationOptions {
  grid: Grid;
  /** global per-step damping (closer to 1.0 = less damping) */
  damping?: number;
  /** absorbing edge layer width in cells */
  pmlWidth?: number;
  /** absorbing edge layer max extra damping */
  pmlStrength?: number;
  /** global gain on per-cell absorption map (boundary.g) */
  absorbStrength?: number;
}

export interface RenderOptions {
  gain: number;
  colormap: ColorMap;
  wallAlpha: number;
  /** Below this |pressure| normalised value, output alpha = 0 */
  alphaThreshold: number;
  /** Gamma curve on alpha; higher = sharper peaks, flatter lows */
  alphaGamma: number;
}

export class FDTDSimulation {
  readonly gl: WebGL2RenderingContext;
  readonly grid: Grid;

  private readonly vao: WebGLVertexArrayObject;
  private readonly fdtdProgram: WebGLProgram;
  private readonly sourceProgram: WebGLProgram;
  private readonly renderProgram: WebGLProgram;

  // Three state slots cycled each step: prev → curr → next → (new prev)
  private state: [StateTexture, StateTexture, StateTexture];
  private idxPrev = 0;
  private idxCurr = 1;
  private idxNext = 2;

  private boundaryTex: WebGLTexture;
  private damping: number;
  private pmlWidth: number;
  private pmlStrength: number;
  private absorbStrength: number;

  private _simTime = 0;
  private _stepCount = 0;

  constructor(canvas: HTMLCanvasElement, opts: FDTDSimulationOptions) {
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error("WebGL2 is not available in this browser.");
    if (!gl.getExtension("EXT_color_buffer_float")) {
      throw new Error("EXT_color_buffer_float unsupported: float render targets required.");
    }

    this.gl = gl;
    this.grid = opts.grid;
    this.damping = opts.damping ?? 0.9998;
    this.pmlWidth = opts.pmlWidth ?? Math.max(12, Math.round(opts.grid.width * 0.05));
    this.pmlStrength = opts.pmlStrength ?? 0.06;
    this.absorbStrength = opts.absorbStrength ?? 0.02;

    const vao = gl.createVertexArray();
    if (!vao) throw new Error("createVertexArray failed");
    this.vao = vao;

    const vs = compileShader(gl, gl.VERTEX_SHADER, FULLSCREEN_VERT);
    this.fdtdProgram = linkProgram(
      gl,
      vs,
      compileShader(gl, gl.FRAGMENT_SHADER, FDTD_STEP_FRAG),
    );
    this.sourceProgram = linkProgram(
      gl,
      vs,
      compileShader(gl, gl.FRAGMENT_SHADER, SOURCE_INJECT_FRAG),
    );
    this.renderProgram = linkProgram(
      gl,
      vs,
      compileShader(gl, gl.FRAGMENT_SHADER, RENDER_FRAG),
    );

    this.state = [
      createStateTexture(gl, opts.grid.width, opts.grid.height),
      createStateTexture(gl, opts.grid.width, opts.grid.height),
      createStateTexture(gl, opts.grid.width, opts.grid.height),
    ];

    this.boundaryTex = createBoundaryTexture(gl, opts.grid.width, opts.grid.height);
  }

  dispose() {
    const gl = this.gl;
    for (const s of this.state) {
      gl.deleteTexture(s.texture);
      gl.deleteFramebuffer(s.framebuffer);
    }
    gl.deleteTexture(this.boundaryTex);
    gl.deleteProgram(this.fdtdProgram);
    gl.deleteProgram(this.sourceProgram);
    gl.deleteProgram(this.renderProgram);
    gl.deleteVertexArray(this.vao);
  }

  get simTimeSeconds(): number {
    return this._simTime;
  }

  get stepCount(): number {
    return this._stepCount;
  }

  /** Wipe the pressure field and reset simulation time. */
  reset() {
    const gl = this.gl;
    this._simTime = 0;
    this._stepCount = 0;
    for (const s of this.state) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, s.framebuffer);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * Upload an interleaved RG boundary mask (row-major, length = cells * 2).
   * Byte layout per cell: [wall (0 air / 255 rigid), absorption 0..255].
   */
  uploadBoundaries(mask: Uint8Array) {
    const gl = this.gl;
    const expected = this.grid.width * this.grid.height * 2;
    if (mask.length !== expected) {
      throw new Error(`Boundary mask size ${mask.length} != expected ${expected}`);
    }
    gl.bindTexture(gl.TEXTURE_2D, this.boundaryTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      this.grid.width,
      this.grid.height,
      gl.RG,
      gl.UNSIGNED_BYTE,
      mask,
    );
  }

  setAbsorbStrength(v: number) {
    this.absorbStrength = v;
  }

  /** Run a single FDTD timestep plus source injection. */
  step(sources: readonly Source[]) {
    const gl = this.gl;
    const { width, height } = this.grid;

    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    // --- 1) FDTD step: p(t-1), p(t) -> p(t+1) ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.state[this.idxNext].framebuffer);
    gl.useProgram(this.fdtdProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.state[this.idxCurr].texture);
    gl.uniform1i(gl.getUniformLocation(this.fdtdProgram, "u_pressure_current"), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.state[this.idxPrev].texture);
    gl.uniform1i(gl.getUniformLocation(this.fdtdProgram, "u_pressure_previous"), 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.boundaryTex);
    gl.uniform1i(gl.getUniformLocation(this.fdtdProgram, "u_boundaries"), 2);

    gl.uniform2f(gl.getUniformLocation(this.fdtdProgram, "u_resolution"), width, height);
    const C = this.grid.courant;
    gl.uniform1f(gl.getUniformLocation(this.fdtdProgram, "u_courant_sq"), C * C);
    gl.uniform1f(gl.getUniformLocation(this.fdtdProgram, "u_damping"), this.damping);
    gl.uniform1f(gl.getUniformLocation(this.fdtdProgram, "u_pml_width"), this.pmlWidth);
    gl.uniform1f(gl.getUniformLocation(this.fdtdProgram, "u_pml_strength"), this.pmlStrength);
    gl.uniform1f(
      gl.getUniformLocation(this.fdtdProgram, "u_absorb_strength"),
      this.absorbStrength,
    );

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // --- 2) Source injection: read from next, write into prev (now free) ---
    const injectTarget = this.state[this.idxPrev]; // will be recycled as new "next"
    gl.bindFramebuffer(gl.FRAMEBUFFER, injectTarget.framebuffer);
    gl.useProgram(this.sourceProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.state[this.idxNext].texture);
    gl.uniform1i(gl.getUniformLocation(this.sourceProgram, "u_pressure"), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.boundaryTex);
    gl.uniform1i(gl.getUniformLocation(this.sourceProgram, "u_boundaries"), 1);

    gl.uniform2f(gl.getUniformLocation(this.sourceProgram, "u_resolution"), width, height);
    gl.uniform1f(gl.getUniformLocation(this.sourceProgram, "u_time"), this._simTime);

    const active = sources.filter((s) => s.enabled).slice(0, MAX_SOURCES);
    const sourceData = new Float32Array(MAX_SOURCES * 4);
    const signalData = new Float32Array(MAX_SOURCES * 4);
    for (let i = 0; i < active.length; i++) {
      const s = active[i];
      const cell = this.grid.metersToCell(s.xMeters, s.yMeters);
      const radiusCells = Math.max(1, s.radiusMeters / this.grid.dx);
      sourceData[i * 4 + 0] = cell.x;
      sourceData[i * 4 + 1] = cell.y;
      sourceData[i * 4 + 2] = s.amplitude;
      sourceData[i * 4 + 3] = radiusCells;
      signalData[i * 4 + 0] = s.frequencyHz;
      signalData[i * 4 + 1] = s.phaseRad;
      signalData[i * 4 + 2] = waveformId(s.waveform);
      signalData[i * 4 + 3] = i * 7.919; // per-source noise seed
    }
    gl.uniform1i(gl.getUniformLocation(this.sourceProgram, "u_source_count"), active.length);
    gl.uniform4fv(gl.getUniformLocation(this.sourceProgram, "u_sources"), sourceData);
    gl.uniform4fv(gl.getUniformLocation(this.sourceProgram, "u_source_signal"), signalData);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // --- 3) Rotate slots ---
    // Before this step: [prev, curr, next] = [P, C, N]
    // FDTD wrote into N. Injection wrote into P (using N as input).
    // So the actual new current state (with sources) lives in injectTarget (slot idxPrev).
    // New curr = injectTarget (idxPrev), new prev = curr (idxCurr), free slot = next (idxNext).
    const newCurr = this.idxPrev;
    const newPrev = this.idxCurr;
    const newNext = this.idxNext;
    this.idxPrev = newPrev;
    this.idxCurr = newCurr;
    this.idxNext = newNext;

    this._simTime += this.grid.dt;
    this._stepCount += 1;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Render the current pressure field into the default framebuffer. */
  render(canvasWidth: number, canvasHeight: number, opts: RenderOptions) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvasWidth, canvasHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.bindVertexArray(this.vao);
    gl.useProgram(this.renderProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.state[this.idxCurr].texture);
    gl.uniform1i(gl.getUniformLocation(this.renderProgram, "u_pressure"), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.boundaryTex);
    gl.uniform1i(gl.getUniformLocation(this.renderProgram, "u_boundaries"), 1);

    gl.uniform1f(gl.getUniformLocation(this.renderProgram, "u_gain"), opts.gain);
    const cmap =
      opts.colormap === "thermal"
        ? 1
        : opts.colormap === "mono"
          ? 2
          : opts.colormap === "dark"
            ? 3
            : 0;
    gl.uniform1i(gl.getUniformLocation(this.renderProgram, "u_colormap"), cmap);
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, "u_wall_alpha"), opts.wallAlpha);
    gl.uniform1f(
      gl.getUniformLocation(this.renderProgram, "u_alpha_threshold"),
      opts.alphaThreshold,
    );
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, "u_alpha_gamma"), opts.alphaGamma);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
  }
}
