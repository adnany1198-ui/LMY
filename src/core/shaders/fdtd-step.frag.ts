export const FDTD_STEP_FRAG = /* glsl */ `#version 300 es
precision highp float;

// Solves the 2D acoustic wave equation via finite differences:
//   p(x, y, t+1) = 2 p(x,y,t) - p(x,y,t-1) + C^2 * Laplacian(p(x,y,t))
// with C = c * dt / dx (Courant number). Stability: C <= 1/sqrt(2).
//
// Boundaries:
//   u_boundaries.r > 0.5 marks a rigid (Neumann) wall cell. For neighbours
//   that are walls, the Laplacian uses a mirror of the centre pressure so
//   dp/dn = 0, producing physical reflection.
//
// Absorbing domain edges:
//   A PML-like damping envelope tapers pressure amplitude in a ring around
//   the grid, preventing spurious reflections from the finite texture edge.

in vec2 v_uv;

uniform sampler2D u_pressure_current;
uniform sampler2D u_pressure_previous;
uniform sampler2D u_boundaries;
uniform vec2 u_resolution;        // grid dimensions in cells
uniform float u_courant_sq;       // C^2
uniform float u_damping;          // global damping factor (e.g. 0.9998)
uniform float u_pml_width;        // PML ring width in cells
uniform float u_pml_strength;     // max extra damping in PML

out vec4 fragColor;

void main() {
    vec2 uv = v_uv;
    vec2 texel = 1.0 / u_resolution;

    float b_c = texture(u_boundaries, uv).r;

    // Wall cells hold zero pressure — the reflection is enforced by
    // their neighbours mirroring back via the Neumann trick below.
    if (b_c > 0.5) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    float p_c    = texture(u_pressure_current,  uv).r;
    float p_prev = texture(u_pressure_previous, uv).r;

    vec2 uvL = uv - vec2(texel.x, 0.0);
    vec2 uvR = uv + vec2(texel.x, 0.0);
    vec2 uvU = uv + vec2(0.0, texel.y);
    vec2 uvD = uv - vec2(0.0, texel.y);

    float b_L = texture(u_boundaries, uvL).r;
    float b_R = texture(u_boundaries, uvR).r;
    float b_U = texture(u_boundaries, uvU).r;
    float b_D = texture(u_boundaries, uvD).r;

    // Neumann reflection: if a neighbour is wall, substitute p_c so the
    // gradient across the wall is zero. This makes walls rigid reflectors.
    float p_L = (b_L > 0.5) ? p_c : texture(u_pressure_current, uvL).r;
    float p_R = (b_R > 0.5) ? p_c : texture(u_pressure_current, uvR).r;
    float p_U = (b_U > 0.5) ? p_c : texture(u_pressure_current, uvU).r;
    float p_D = (b_D > 0.5) ? p_c : texture(u_pressure_current, uvD).r;

    float laplacian = p_L + p_R + p_U + p_D - 4.0 * p_c;

    float p_next = 2.0 * p_c - p_prev + u_courant_sq * laplacian;

    // Distance to nearest grid edge (in cells)
    vec2 coord = uv * u_resolution;
    float d_edge = min(min(coord.x, u_resolution.x - coord.x),
                       min(coord.y, u_resolution.y - coord.y));
    float pml_t = clamp(1.0 - d_edge / max(u_pml_width, 1.0), 0.0, 1.0);
    float edge_damp = 1.0 - u_pml_strength * pml_t * pml_t;

    p_next *= u_damping * edge_damp;

    fragColor = vec4(p_next, 0.0, 0.0, 1.0);
}
`;
