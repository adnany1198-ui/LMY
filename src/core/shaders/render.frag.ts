export const RENDER_FRAG = /* glsl */ `#version 300 es
precision highp float;

// Renders the pressure field as colour. Negative pressure maps to one
// end of the palette, positive to the other, with a threshold + gamma
// curve on alpha so low-amplitude cells are fully transparent and only
// the wavefront peaks paint over the background.

in vec2 v_uv;

uniform sampler2D u_pressure;
uniform sampler2D u_boundaries;
uniform float u_gain;         // visual gain multiplier on pressure
uniform int u_colormap;       // 0 spectral, 1 thermal, 2 mono, 3 dark
uniform float u_wall_alpha;   // overlay alpha for wall cells
uniform float u_alpha_threshold; // |p| below this -> fully transparent
uniform float u_alpha_gamma;  // contrast curve on alpha (higher = sharper peaks)

out vec4 fragColor;

vec3 spectral(float t) {
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

// Black at zero, deep blue for negative, magenta/white for positive.
// Darker than 'spectral' so the site plan reads clearly underneath.
vec3 darkSpectrogram(float t) {
    float a = clamp(-t, 0.0, 1.0);
    float b = clamp( t, 0.0, 1.0);
    vec3 neg = mix(vec3(0.0), vec3(0.05, 0.18, 0.55), a);
    neg = mix(neg, vec3(0.25, 0.65, 1.0), pow(a, 2.4));
    vec3 pos = mix(vec3(0.0), vec3(0.6, 0.05, 0.35), b);
    pos = mix(pos, vec3(1.0, 0.6, 0.95), pow(b, 2.4));
    return neg + pos;
}

void main() {
    // WebGL textures have y=0 at the bottom, but the rest of the app (click
    // handlers, SVG overlays, site-plan image, segmentation canvas) all use
    // the DOM convention of y=0 at the top. Sampling with a flipped Y keeps
    // the displayed pressure aligned with every other layer without having
    // to flip the physics textures themselves.
    vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
    float p = texture(u_pressure, uv).r * u_gain;
    float wall = texture(u_boundaries, uv).r;

    float t = clamp(p, -1.0, 1.0);

    vec3 colour;
    if (u_colormap == 1) colour = thermal(t);
    else if (u_colormap == 2) colour = mono(t);
    else if (u_colormap == 3) colour = darkSpectrogram(t);
    else colour = spectral(t);

    float a = clamp(abs(t), 0.0, 1.0);
    // Threshold knee: below -> 0, above -> remapped into [0,1]
    float denom = max(1.0 - u_alpha_threshold, 1e-4);
    float aNorm = clamp((a - u_alpha_threshold) / denom, 0.0, 1.0);
    float alpha = pow(aNorm, max(u_alpha_gamma, 0.01));

    if (wall > 0.5) {
        fragColor = vec4(0.05, 0.05, 0.07, u_wall_alpha);
        return;
    }

    fragColor = vec4(colour, alpha);
}
`;
