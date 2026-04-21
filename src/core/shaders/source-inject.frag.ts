export const SOURCE_INJECT_FRAG = /* glsl */ `#version 300 es
precision highp float;

// Additive source injection pass. For each active source we add a
// spatially-smoothed signal into the cells within a small radius of the
// source position. Running this as a separate pass after the FDTD update
// keeps the physics kernel clean and lets us change source behaviour
// without touching the main integrator.

in vec2 v_uv;

#define MAX_SOURCES 32

uniform sampler2D u_pressure;     // result of FDTD step
uniform vec2 u_resolution;        // grid dimensions in cells
uniform int u_source_count;
uniform vec4 u_sources[MAX_SOURCES]; // xy = grid pos, z = amplitude, w = radius (cells)
uniform vec4 u_source_signal[MAX_SOURCES]; // x = freq Hz, y = phase rad, z = waveform id, w = seed
uniform float u_time;             // simulated time in seconds

out vec4 fragColor;

float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

void main() {
    vec2 coord = v_uv * u_resolution;
    float p = texture(u_pressure, v_uv).r;

    for (int i = 0; i < MAX_SOURCES; i++) {
        if (i >= u_source_count) break;
        vec4 s = u_sources[i];
        vec4 sig = u_source_signal[i];

        vec2 spos = s.xy;
        float amp = s.z;
        float radius = max(s.w, 0.5);

        float d = distance(coord, spos);
        if (d > radius * 2.5) continue;

        float w = exp(-(d * d) / (radius * radius));

        float freq = sig.x;
        float phase = sig.y;
        int waveform = int(sig.z + 0.5);
        float seed = sig.w;

        float value = 0.0;
        if (waveform == 0) {
            // Sine
            value = sin(6.28318530718 * freq * u_time + phase);
        } else if (waveform == 1) {
            // Gaussian impulse, only lives during the first ~1/freq seconds
            float t0 = 1.0 / max(freq, 1.0);
            float tt = u_time - t0 * 0.5;
            float sigma = t0 * 0.15;
            value = exp(-(tt * tt) / (2.0 * sigma * sigma));
        } else if (waveform == 2) {
            // Band-limited noise (white noise, cell/time dependent)
            value = (hash(vec2(u_time * freq + seed, seed)) - 0.5) * 2.0;
        }

        p += amp * w * value;
    }

    fragColor = vec4(p, 0.0, 0.0, 1.0);
}
`;
