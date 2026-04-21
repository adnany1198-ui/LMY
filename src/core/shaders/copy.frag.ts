export const COPY_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_src;
out vec4 fragColor;
void main() { fragColor = texture(u_src, v_uv); }
`;
