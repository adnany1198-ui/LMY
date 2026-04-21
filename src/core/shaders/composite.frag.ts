export const COMPOSITE_FRAG = /* glsl */ `#version 300 es
precision highp float;

// Composites the per-source pressure textures into one picture.
//
// Hue is chosen by dominance: each channel weighs its colour by
// intensity^2, so the loudest speaker at a cell wins the hue while a
// much quieter one barely tints it. Only near-equal amplitudes produce
// a true blend. Brightness (alpha) is the L2 norm of the intensities,
// so overlapping loud speakers look brighter than one alone — without
// saturating to white.
//
// Texture y is flipped on sampling: the internal pipeline uses WebGL's
// native y-up convention but the whole DOM/UI side uses y-down, and the
// flip keeps the displayed field in sync with every other overlay.

#define MAX_CHANNELS 8

in vec2 v_uv;

uniform sampler2D u_pressure_0;
uniform sampler2D u_pressure_1;
uniform sampler2D u_pressure_2;
uniform sampler2D u_pressure_3;
uniform sampler2D u_pressure_4;
uniform sampler2D u_pressure_5;
uniform sampler2D u_pressure_6;
uniform sampler2D u_pressure_7;
uniform sampler2D u_boundaries;

uniform int u_channel_count;
uniform vec3 u_colors[MAX_CHANNELS];

uniform float u_gain;
uniform float u_alpha_threshold;
uniform float u_gamma;         // visibility curve: >1 lifts quiet regions
uniform int u_scale_mode;      // 0 = linear, 1 = dB
uniform float u_db_floor;      // dB where opacity reaches zero (negative, e.g. -60)
uniform float u_wall_alpha;

out vec4 fragColor;

float sampleChannel(int idx, vec2 uv) {
    if (idx == 0) return texture(u_pressure_0, uv).r;
    if (idx == 1) return texture(u_pressure_1, uv).r;
    if (idx == 2) return texture(u_pressure_2, uv).r;
    if (idx == 3) return texture(u_pressure_3, uv).r;
    if (idx == 4) return texture(u_pressure_4, uv).r;
    if (idx == 5) return texture(u_pressure_5, uv).r;
    if (idx == 6) return texture(u_pressure_6, uv).r;
    return texture(u_pressure_7, uv).r;
}

float intensityFor(float amp) {
    // Raw 0..1 intensity after gain, before any curve.
    float a = clamp(amp * u_gain, 0.0, 1.0);

    float i;
    if (u_scale_mode == 1) {
        // dB scale: 20·log10(a). Clamp to u_db_floor..0 and remap to 0..1,
        // so tiny pressures decay visibly instead of collapsing to black.
        float db = 20.0 * log(max(amp * u_gain, 1e-5)) / log(10.0);
        float floor_db = min(u_db_floor, -1.0);
        i = clamp((db - floor_db) / (0.0 - floor_db), 0.0, 1.0);
    } else {
        i = a;
    }

    // Apply threshold knee — below it, go to zero.
    float denom = max(1.0 - u_alpha_threshold, 1e-4);
    i = clamp((i - u_alpha_threshold) / denom, 0.0, 1.0);

    // Visibility gamma. >1 makes distant wavefronts brighter; <1 isolates
    // only the loudest zones near each source.
    return pow(i, 1.0 / max(u_gamma, 0.05));
}

void main() {
    vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);

    float wall = texture(u_boundaries, uv).r;
    if (wall > 0.5) {
        fragColor = vec4(0.05, 0.05, 0.07, u_wall_alpha);
        return;
    }

    vec3 hue_weighted = vec3(0.0);
    float energy = 0.0;

    for (int i = 0; i < MAX_CHANNELS; i++) {
        if (i >= u_channel_count) break;
        float p = sampleChannel(i, uv);
        float intensity = intensityFor(abs(p));
        float w = intensity * intensity;
        hue_weighted += u_colors[i] * w;
        energy += w;
    }

    vec3 hue = energy > 1e-6 ? hue_weighted / energy : vec3(0.0);
    float brightness = clamp(sqrt(energy), 0.0, 1.0);
    fragColor = vec4(hue, brightness);
}
`;
