// Extracted from undivisible.dev's ascii-shader.ts; see NOTICE.md.
precision highp float;
varying vec2 v_uv;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_colorA;
uniform vec3 u_colorB;
uniform vec3 u_colorC;
uniform vec3 u_colorD;
uniform vec3 u_colorE;
uniform float u_ascii;
uniform sampler2D u_glyphs;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float value = 0.0, amplitude = 0.5;
  for (int i = 0; i < 2; i++) {
    value += amplitude * noise(p);
    p = p * 1.7 + vec2(1.7, 9.2);
    amplitude *= 0.58;
  }
  return value;
}
vec3 palette(float t) {
  if (t < 0.25) return mix(u_colorA, u_colorB, smoothstep(0.0, 0.25, t));
  if (t < 0.5) return mix(u_colorB, u_colorC, smoothstep(0.25, 0.5, t));
  if (t < 0.75) return mix(u_colorC, u_colorD, smoothstep(0.5, 0.75, t));
  return mix(u_colorD, u_colorE, smoothstep(0.75, 1.0, t));
}
float shape(vec2 p, vec2 center, float angle, float kind) {
  vec2 d = p - center;
  d = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * d;
  if (kind < 0.5) return 1.0 - step(0.15, length(d));
  if (kind < 1.5) return 1.0 - step(0.14, max(abs(d.x), abs(d.y)));
  return (1.0 - step(0.17, d.y)) * step(-0.19, d.y) *
    (1.0 - step((d.y + 0.19) * 0.55, abs(d.x)));
}
void main() {
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  float rows = clamp(u_resolution.y / 14.0, 28.0, 80.0);
  vec2 grid = vec2(rows * aspect / 0.62, rows);
  vec2 uv = mix(v_uv, (floor(v_uv * grid) + 0.5) / grid, u_ascii);
  vec2 p = uv * vec2(aspect, 1.0);
  float t = u_time * 0.09;
  vec2 flow = vec2(fbm(p * 0.9 + vec2(t * 0.45, -t * 0.22)),
    fbm(p * 0.95 + vec2(-t * 0.18, t * 0.34)));
  vec2 warped = p + (flow - 0.5) * 0.55;
  // Expand the source's 0.79-amplitude field so all five accents can appear.
  float fluid = smoothstep(0.12, 0.68, fbm(warped * 1.45 + vec2(t * 0.26, -t * 0.12)));
  vec3 color = palette(fluid) * clamp(0.52 + fluid * 0.9, 0.0, 1.0);
  float invert = max(shape(p, vec2(aspect * (0.5 + 0.29 * sin(t * 0.7)),
    0.5 + 0.28 * cos(t * 0.9)), t, 0.0),
    max(shape(p, vec2(aspect * (0.5 + 0.30 * cos(t * 0.6)),
    0.5 + 0.27 * sin(t * 0.8)), -t * 0.7, 1.0),
    shape(p, vec2(aspect * (0.5 + 0.28 * sin(t * 0.5 + 2.0)),
    0.5 + 0.27 * cos(t * 0.7 + 2.0)), t * 0.5, 2.0)));
  if (u_ascii > 0.5) {
    color = mix(color, 1.0 - color, invert);
    float brightness = dot(color, vec3(0.299, 0.587, 0.114));
    float index = floor(clamp(brightness * 0.7 + ((color.r - color.g) * 0.5 + 0.5) * 0.3, 0.0, 1.0) * 9.0);
    vec2 cell = fract(v_uv * grid);
    float ink = texture2D(u_glyphs, vec2((index + cell.x) / 10.0, 1.0 - cell.y)).a;
    color = mix(vec3(0.025, 0.035, 0.055), color, ink * mix(0.72, 0.94, invert));
  }
  gl_FragColor = vec4(color, 1.0);
}
