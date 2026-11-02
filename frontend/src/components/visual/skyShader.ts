/**
 * Фрагментный шейдер «моря» для WebGL1 (работает во всех современных браузерах, без WebGPU).
 * Сверху небо, ниже линии горизонта — море с волнами и дорожкой от солнца/луны.
 * u_night: 0 — закат (золотой час над портом), 1 — ночь (луна, звёзды, лёгкое сияние).
 * Значение анимируется между 0 и 1, поэтому смена дня и ночи плавная.
 *
 * HORIZON — доля высоты от низа, где проходит горизонт. Силуэты судна и кранов (OceanScene)
 * ставятся на эту же линию, поэтому значение экспортируется.
 */
export const HORIZON = 0.34;

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

const float HORIZON = ${HORIZON.toFixed(2)};

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

// Небо: y — высота над горизонтом (0..1), x — с учётом пропорций
vec3 sky(float x, float y, float aspect, float t, vec2 light) {
  // Закат: густой синий сверху, медь и золото у горизонта
  vec3 duskTop = vec3(0.04, 0.10, 0.24);
  vec3 duskMid = vec3(0.30, 0.25, 0.42);
  vec3 duskLow = vec3(1.00, 0.58, 0.26);
  vec3 dusk = mix(duskLow, duskMid, smoothstep(0.0, 0.35, y));
  dusk = mix(dusk, duskTop, smoothstep(0.30, 1.0, y));

  // Ночь: глубокий синий, у горизонта светлее — зарево огней порта
  vec3 nightCol = mix(vec3(0.13, 0.20, 0.34), vec3(0.03, 0.07, 0.17), smoothstep(0.0, 0.7, y));
  vec3 col = mix(dusk, nightCol, u_night);

  // Светило: солнце низко над водой или луна выше
  float d = length(vec2(x, y) - light);
  // Диск солнца + мягкое гало
  vec3 sunGlow = vec3(1.0, 0.70, 0.30) * (0.70 * exp(-d * 3.5) + 0.9 * exp(-d * 18.0)) + vec3(1.0, 0.92, 0.72) * smoothstep(0.050, 0.040, d);
  vec3 moonGlow = vec3(0.75, 0.85, 1.0) * (0.30 * exp(-d * 4.5) + 1.0 * smoothstep(0.040, 0.030, d));
  col += mix(sunGlow, moonGlow, u_night);

  // Облака — тонкие вытянутые полосы, медленно плывут
  vec2 cp = vec2(x * 1.2 - t * 0.012 + u_seed, y * 5.0);
  float clouds = smoothstep(0.55, 0.85, fbm(cp)) * smoothstep(0.05, 0.25, y);
  vec3 cloudCol = mix(vec3(1.0, 0.72, 0.52), vec3(0.18, 0.24, 0.36), u_night);
  col = mix(col, cloudCol, clouds * 0.35);

  // Звёзды — только ночью и высоко
  vec2 grid = vec2(x, y) * 70.0;
  vec2 cell = floor(grid);
  float h = hash(cell + u_seed);
  if (h > 0.986) {
    vec2 center = cell + 0.2 + 0.6 * vec2(hash(cell + 1.7), hash(cell + 3.1));
    float twinkle = 0.5 + 0.5 * sin(t * (0.8 + h * 2.0) + h * 40.0);
    col += vec3(0.9, 0.93, 1.0) * smoothstep(0.10, 0.0, length(grid - center)) * twinkle * smoothstep(0.2, 0.7, y) * u_night;
  }
  return col;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  float t = u_time;
  float x = uv.x * aspect;
  // Солнце садится справа у горизонта, луна стоит выше
  vec2 light = mix(vec2(0.74 * aspect, 0.10), vec2(0.80 * aspect, 0.55), u_night);

  vec3 col;
  if (uv.y >= HORIZON) {
    col = sky(x, (uv.y - HORIZON) / (1.0 - HORIZON), aspect, t, light);
  } else {
    // Море: перспектива — чем ближе к горизонту, тем мельче и плотнее волны
    float depth = (HORIZON - uv.y) / HORIZON;            // 0 у горизонта, 1 у края кадра
    float z = 1.0 / (depth + 0.06);
    vec2 wp = vec2(x * z * 0.9, z * 1.4);
    float waves = fbm(wp + vec2(t * 0.10, -t * 0.35)) * 0.6 + fbm(wp * 2.3 + vec2(-t * 0.18, -t * 0.55)) * 0.4;

    vec3 deep = mix(vec3(0.05, 0.12, 0.24), vec3(0.03, 0.07, 0.14), u_night);
    vec3 near = mix(vec3(0.12, 0.24, 0.40), vec3(0.08, 0.15, 0.27), u_night);
    col = mix(near, deep, smoothstep(0.0, 1.0, depth));

    // Отражение неба у горизонта
    vec3 horizonSky = sky(x, 0.02, aspect, t, light);
    col = mix(col, horizonSky * 0.65, exp(-depth * 7.0));

    // Дорожка света: узкая у горизонта, шире к зрителю, рябит по гребням волн
    float lane = exp(-abs(x - light.x) * (6.0 - depth * 4.0));
    float glitter = smoothstep(0.55, 0.85, waves);
    vec3 laneCol = mix(vec3(1.0, 0.72, 0.36), vec3(0.70, 0.80, 1.0), u_night);
    col += laneCol * lane * (0.25 + glitter) * mix(1.1, 0.85, u_night);

    // Гребни волн слегка светлее
    col += vec3(0.06, 0.10, 0.16) * smoothstep(0.6, 0.9, waves) * (1.0 - depth * 0.5);

    // Дымка на самом горизонте
    col = mix(col, horizonSky, smoothstep(0.03, 0.0, depth) * 0.8);
  }

  // Виньетка и затемнение верхнего левого угла — там текст
  col *= 1.0 - 0.22 * pow(length(uv - vec2(0.55, 0.45)), 2.0);
  col *= mix(0.78, 1.0, smoothstep(0.0, 0.6, uv.x + (1.0 - uv.y) * 0.4));
  gl_FragColor = vec4(col, 1.0);
}
`;
