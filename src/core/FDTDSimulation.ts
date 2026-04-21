/**
 * FDTDSimulation — GPU-resident 2D acoustic wave solver with one pressure
 * field per speaker.
 *
 * Each source gets its own three-slot ping-pong of RGBA16F textures. Because
 * the linear wave equation is identical for every channel, the summed field
 * reproduces the classical single-channel FDTD; keeping them separate just
 * gives the renderer per-source intensities to paint in distinct colours.
 *
 * Per timestep, for each channel:
 *   1. fdtdProgram   : p(t-1), p(t), boundaries → p(t+1)                (next slot)
 *   2. sourceProgram : p(t+1) + this channel's source term              (prev slot)
 * After all channels step, slot indices rotate so the source-injected slot
 * becomes the new "current".
 *
 * Boundaries (walls, absorption) are shared across channels — speakers see
 * the same world.
 */

import { FDTD_STEP_FRAG } from "./shaders/fdtd-step.frag";
import { SOURCE_INJECT_FRAG } from "./shaders/source-inject.frag";
import { COMPOSITE_FRAG } from "./shaders/composite.frag";
import { FULLSCREEN_VERT } from "./shaders/fullscreen.vert";
import type { Grid } from "./Grid";
import { Source, waveformId } from "./Source";

export type ScaleMode = "linear" | "db";

export const MAX_CHANNELS = 8;

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

interface Channel {
  sourceId: string;
  state: [StateTexture, StateTexture, StateTexture];
}

export interface FDTDSimulationOptions {
  grid: Grid;
  damping?: number;
  pmlWidth?: number;
  pmlStrength?: number;
  absorbStrength?: number;
}

export interface RenderOptions {
  gain: number;
  wallAlpha: number;
  alphaThreshold: number;
  /** Visibility curve. >1 = lift quiet wavefronts, <1 = isolate peaks only. */
  gamma: number;
  scaleMode: ScaleMode;
  /** dB value at which intensity falls to 0 in dB mode (e.g. -60). */
  dbFloor: number;
}

export class FDTDSimulation {
  readonly gl: WebGL2RenderingContext;
  readonly grid: Grid;

  private readonly vao: WebGLVertexArrayObject;
  private readonly fdtdProgram: WebGLProgram;
  private readonly sourceProgram: WebGLProgram;
  private readonly compositeProgram: WebGLProgram;

  private channels: Channel[] = [];
  /** Fallback texture bound to unused composite samplers so drivers don't complain. */
  private dummyTexture: WebGLTexture;

  // Slot indices are shared across channels — every channel advances together.
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
    this.compositeProgram = linkProgram(
      gl,
      vs,
      compileShader(gl, gl.FRAGMENT_SHADER, COMPOSITE_FRAG),
    );

    this.boundaryTex = createBoundaryTexture(gl, opts.grid.width, opts.grid.height);

    // Tiny all-zero RGBA16F texture used to fill unused composite samplers.
    const dummy = gl.createTexture();
    if (!dummy) throw new Error("createTexture failed");
    gl.bindTexture(gl.TEXTURE_2D, dummy);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 1, 1, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.dummyTexture = dummy;
  }

  dispose() {
    const gl = this.gl;
    for (const ch of this.channels) {
      for (const s of ch.state) {
        gl.deleteTexture(s.texture);
        gl.deleteFramebuffer(s.framebuffer);
      }
    }
    this.channels = [];
    gl.deleteTexture(this.boundaryTex);
    gl.deleteTexture(this.dummyTexture);
    gl.deleteProgram(this.fdtdProgram);
    gl.deleteProgram(this.sourceProgram);
    gl.deleteProgram(this.compositeProgram);
    gl.deleteVertexArray(this.vao);
  }

  get simTimeSeconds(): number {
    return this._simTime;
  }

  get stepCount(): number {
    return this._stepCount;
  }

  /** Wipe all pressure fields. */
  reset() {
    const gl = this.gl;
    this._simTime = 0;
    this._stepCount = 0;
    for (const ch of this.channels) {
      for (const s of ch.state) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, s.framebuffer);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
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

  setDamping(v: number) {
    this.damping = v;
  }

  /** Allocate a channel for each source id, disposing channels whose source
   *  is gone. Caps at MAX_CHANNELS — extra sources fall off the end. */
  private syncChannels(sources: readonly Source[]) {
    const gl = this.gl;
    const keep = new Set<string>();
    const cap = sources.slice(0, MAX_CHANNELS);
    for (const s of cap) keep.add(s.id);

    // Drop channels whose source no longer exists
    this.channels = this.channels.filter((ch) => {
      if (keep.has(ch.sourceId)) return true;
      for (const t of ch.state) {
        gl.deleteTexture(t.texture);
        gl.deleteFramebuffer(t.framebuffer);
      }
      return false;
    });

    // Add channels for new sources, preserving the source order for colour stability
    const existing = new Map(this.channels.map((ch) => [ch.sourceId, ch]));
    const next: Channel[] = [];
    for (const s of cap) {
      const prior = existing.get(s.id);
      if (prior) {
        next.push(prior);
      } else {
        next.push({
          sourceId: s.id,
          state: [
            createStateTexture(gl, this.grid.width, this.grid.height),
            createStateTexture(gl, this.grid.width, this.grid.height),
            createStateTexture(gl, this.grid.width, this.grid.height),
          ],
        });
      }
    }
    this.channels = next;
  }

  /** Run a single FDTD timestep for every active channel. */
  step(sources: readonly Source[]) {
    this.syncChannels(sources);
    const gl = this.gl;
    const { width, height } = this.grid;

    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    for (let i = 0; i < this.channels.length; i++) {
      const ch = this.channels[i];
      const src = sources[i];
      this.stepChannel(ch, src);
    }

    // Rotate slots so the source-injected slot becomes the new "current".
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

  private stepChannel(ch: Channel, src: Source) {
    const gl = this.gl;
    const { width, height } = this.grid;

    // --- 1) FDTD step: p(t-1), p(t) -> p(t+1) into idxNext ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, ch.state[this.idxNext].framebuffer);
    gl.useProgram(this.fdtdProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ch.state[this.idxCurr].texture);
    gl.uniform1i(gl.getUniformLocation(this.fdtdProgram, "u_pressure_current"), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, ch.state[this.idxPrev].texture);
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

    // --- 2) Source injection: read from next, write into prev slot ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, ch.state[this.idxPrev].framebuffer);
    gl.useProgram(this.sourceProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ch.state[this.idxNext].texture);
    gl.uniform1i(gl.getUniformLocation(this.sourceProgram, "u_pressure"), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.boundaryTex);
    gl.uniform1i(gl.getUniformLocation(this.sourceProgram, "u_boundaries"), 1);

    gl.uniform2f(gl.getUniformLocation(this.sourceProgram, "u_resolution"), width, height);
    gl.uniform1f(gl.getUniformLocation(this.sourceProgram, "u_time"), this._simTime);

    const sourceData = new Float32Array(4);
    const signalData = new Float32Array(4);
    const activeAmp = src.enabled ? src.amplitude : 0;
    const cell = this.grid.metersToCell(src.xMeters, src.yMeters);
    const radiusCells = Math.max(1, src.radiusMeters / this.grid.dx);
    sourceData[0] = cell.x;
    sourceData[1] = cell.y;
    sourceData[2] = activeAmp;
    sourceData[3] = radiusCells;
    signalData[0] = src.frequencyHz;
    signalData[1] = src.phaseRad;
    signalData[2] = waveformId(src.waveform);
    signalData[3] = 0; // per-source noise seed not needed when one channel per source
    gl.uniform1i(gl.getUniformLocation(this.sourceProgram, "u_source_count"), 1);
    gl.uniform4fv(gl.getUniformLocation(this.sourceProgram, "u_sources"), sourceData);
    gl.uniform4fv(gl.getUniformLocation(this.sourceProgram, "u_source_signal"), signalData);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Composite all channels into the default framebuffer. */
  render(
    canvasWidth: number,
    canvasHeight: number,
    sources: readonly Source[],
    opts: RenderOptions,
  ) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvasWidth, canvasHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.bindVertexArray(this.vao);
    gl.useProgram(this.compositeProgram);

    const count = Math.min(this.channels.length, MAX_CHANNELS);

    // Bind channel textures into units 0..MAX_CHANNELS-1, boundaries at MAX_CHANNELS.
    for (let i = 0; i < MAX_CHANNELS; i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(
        gl.TEXTURE_2D,
        i < count ? this.channels[i].state[this.idxCurr].texture : this.dummyTexture,
      );
      gl.uniform1i(gl.getUniformLocation(this.compositeProgram, `u_pressure_${i}`), i);
    }
    gl.activeTexture(gl.TEXTURE0 + MAX_CHANNELS);
    gl.bindTexture(gl.TEXTURE_2D, this.boundaryTex);
    gl.uniform1i(
      gl.getUniformLocation(this.compositeProgram, "u_boundaries"),
      MAX_CHANNELS,
    );

    // Colours — stride 3, one vec3 per channel in source order.
    const colors = new Float32Array(MAX_CHANNELS * 3);
    for (let i = 0; i < count; i++) {
      const s = sources[i];
      colors[i * 3 + 0] = s.color[0];
      colors[i * 3 + 1] = s.color[1];
      colors[i * 3 + 2] = s.color[2];
    }
    gl.uniform3fv(gl.getUniformLocation(this.compositeProgram, "u_colors"), colors);
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, "u_channel_count"), count);

    gl.uniform1f(gl.getUniformLocation(this.compositeProgram, "u_gain"), opts.gain);
    gl.uniform1f(
      gl.getUniformLocation(this.compositeProgram, "u_alpha_threshold"),
      opts.alphaThreshold,
    );
    gl.uniform1f(gl.getUniformLocation(this.compositeProgram, "u_gamma"), opts.gamma);
    gl.uniform1i(
      gl.getUniformLocation(this.compositeProgram, "u_scale_mode"),
      opts.scaleMode === "db" ? 1 : 0,
    );
    gl.uniform1f(gl.getUniformLocation(this.compositeProgram, "u_db_floor"), opts.dbFloor);
    gl.uniform1f(gl.getUniformLocation(this.compositeProgram, "u_wall_alpha"), opts.wallAlpha);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
  }
}
