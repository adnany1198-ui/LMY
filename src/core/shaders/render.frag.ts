export const RENDER_FRAG = /* glsl */ `#version 300 es
precision highp float;

// Renders the pressure field as colour. Negative pressure maps to one
// end of the palette, positive to the other, with zero crossing at
// transparent black — so the site plan behind this layer shows through.

in vec2 v_uv;

uniform sampler2D u_pressure;
uniform sampler2D u_boundaries;
uniform float u_gain;       // visual gain multiplier
uniform int u_colormap;     // 0 = spectral, 1 = thermal, 2 = mono
uniform float u_wall_alpha; // overlay alpha for wall cells

out vec4 fragColor;

vec3 spectral(float t) {
    // t in [-1, 1]: blue (negative) -> black (zero) -> magenta/white (positive)
    float a = clamp(-t, 0.0, 1.0);
    float b = clamp( t, 0.0, 1.0);
    vec3 neg = mix(vec3(0.0), vec3(0.15, 0.45, 1.0), a);
    neg = mix(neg, vec3(0.3, 0.8, 1.0), pow(a, 2.0));
    vec3 pos = mix(vec3(0.0), vec3(1.0, 0.18, 0.55), b);
    pos = mix(pos, vec3(1.0, 0.9, 1.0), pow(b, 2.0));
    return neg + pos;
}

vec3 thermal(float t) {
    float x = clamp(abs(t), 0.0, 1.0);
    vec3 c = vec3(0.0);
    c = mix(c, vec3(0.5, 0.0, 0.0), smoothstep(0.0, 0.25, x));
    c = mix(c, vec3(1.0, 0.2, 0.0), smoothstep(0.25, 0.5, x));
    c = mix(c, vec3(1.0, 0.85, 0.15), smoothstep(0.5, 0.8, x));
    c = mix(c, vec3(1.0, 1.0, 1.0), smoothstep(0.8, 1.0, x));
    return c;
}

vec3 mono(float t) {
    float x = clamp(abs(t), 0.0, 1.0);
    return vec3(x);
}

void main() {
    float p = texture(u_pressure, v_uv).r * u_gain;
    float wall = texture(u_boundaries, v_uv).r;

    float t = clamp(p, -1.0, 1.0);

    vec3 colour;
    if (u_colormap == 1) colour = thermal(t);
    else if (u_colormap == 2) colour = mono(t);
    else colour = spectral(t);

    float alpha = clamp(abs(t), 0.0, 1.0);
    // Slight floor so near-zero pressure still reads as faint wash
    alpha = pow(alpha, 0.6);

    if (wall > 0.5) {
        fragColor = vec4(0.05, 0.05, 0.07, u_wall_alpha);
        return;
    }

    fragColor = vec4(colour, alpha);
}
`;
