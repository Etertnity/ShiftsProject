/**
 * Фрагментный шейдер «неба» для WebGL1 (работает во всех современных браузерах, без WebGPU).
 * u_night: 0 — день (синее небо, солнце, облака), 1 — ночь (полярное сияние и звёзды).
 * Значение анимируется между 0 и 1, поэтому смена дня и ночи плавная.
 */
export const VERTEX_SHADER = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const FRAGMENT_SHADER = `
precision mediump float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_night;
uniform float u_seed;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

vec3 daySky(vec2 uv, float aspect, float t) {
  // Глубокий синий сверху, светлее к горизонту — белый текст остаётся читаемым
  vec3 top = vec3(0.13, 0.33, 0.86);
  vec3 bottom = vec3(0.20, 0.60, 0.95);
  vec3 col = mix(bottom, top, smoothstep(0.0, 1.0, uv.y));

  // Мягкое солнце в правом верхнем углу, медленно «дышит»
  vec2 sunPos = vec2(0.85 * aspect, 0.95 + 0.03 * sin(t * 0.2));
  float d = length(vec2(uv.x * aspect, uv.y) - sunPos);
  col += vec3(1.0, 0.82, 0.45) * 0.55 * exp(-d * 3.2);
  col += vec3(1.0, 0.95, 0.80) * 0.25 * exp(-d * 12.0);

  // Облака — низкоконтрастный шум, плывущий вправо
  vec2 cp = vec2(uv.x * aspect * 1.6 - t * 0.025 + u_seed, uv.y * 2.6);
  float clouds = smoothstep(0.52, 0.85, fbm(cp));
  col = mix(col, vec3(0.92, 0.96, 1.0), clouds * 0.35);
  return col;
}

vec3 nightSky(vec2 uv, float aspect, float t) {
  vec3 top = vec3(0.03, 0.04, 0.12);
  vec3 bottom = vec3(0.10, 0.08, 0.26);
  vec3 col = mix(bottom, top, smoothstep(0.0, 1.0, uv.y));

  // Полярное сияние: две изогнутые ленты, медленно колышутся
  float x = uv.x * aspect;
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float wave = 0.55 + 0.12 * sin(x * (1.3 + fi * 0.7) + t * (0.15 + fi * 0.05) + fbm(vec2(x * 0.8, t * 0.05 + fi)) * 2.5);
    float band = exp(-pow((uv.y - wave + fi * 0.12) * 7.0, 2.0));
    float flicker = 0.6 + 0.4 * fbm(vec2(x * 3.0 + fi * 5.0, t * 0.25));
    vec3 tint = mix(vec3(0.15, 0.85, 0.65), vec3(0.55, 0.40, 1.0), fi);
    col += tint * band * flicker * 0.45;
  }

  // Звёзды: редкие мелкие точки с мерцанием, гуще у верха неба
  vec2 grid = vec2(uv.x * aspect, uv.y) * 60.0;
  vec2 cell = floor(grid);
  float h = hash(cell + u_seed);
  if (h > 0.985) {
    vec2 center = cell + 0.2 + 0.6 * vec2(hash(cell + 1.7), hash(cell + 3.1));
    float dist = length(grid - center);
    float twinkle = 0.5 + 0.5 * sin(t * (0.8 + h * 2.0) + h * 40.0);
    float height = smoothstep(0.15, 0.9, uv.y);
    col += vec3(0.9, 0.93, 1.0) * smoothstep(0.09, 0.0, dist) * twinkle * height * 0.9;
  }
  return col;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec3 col = mix(daySky(uv, aspect, u_time), nightSky(uv, aspect, u_time), u_night);
  // Лёгкая виньетка по краям
  col *= 1.0 - 0.18 * pow(length(uv - 0.5), 2.0);
  gl_FragColor = vec4(col, 1.0);
}
`;
