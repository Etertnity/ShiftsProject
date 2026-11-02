/** @type {import('tailwindcss').Config} */
const colors = require('tailwindcss/colors');
const plugin = require('tailwindcss/plugin');

/*
 * Тема день/ночь на CSS-переменных.
 * Классы в разметке остаются обычными (bg-gray-50, text-sky-700…), а их значения подменяются
 * в `.dark` — поэтому тёмная тема работает во всех компонентах без `dark:`-дублей.
 */

const toRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const blend = (fg, bg, t) => fg.map((c, i) => Math.round(c * t + bg[i] * (1 - t)));
const channels = (rgb) => rgb.join(' ');

// «Ночной порт»: глубокий морской синий вместо нейтрально-серого
const SURFACE_DARK = [12, 26, 45];

// Нейтральная шкала: светлая — slate с морским оттенком, тёмная — ступени navy (фон темнее карточек)
const GRAY_DARK = {
  50: [5, 13, 25],
  100: [18, 35, 58],
  200: [27, 47, 75],
  300: [44, 66, 99],
  400: [100, 123, 156],
  500: [139, 160, 189],
  600: [171, 188, 211],
  700: [201, 214, 231],
  800: [225, 233, 243],
  900: [240, 245, 251],
  950: [248, 250, 253],
};
// Светлая тема — «дневной порт»: фон страницы чуть голубее белых карточек
const GRAY_LIGHT_OVERRIDES = { 50: [240, 244, 249] };

// Золото маяка: главные действия и акценты, как в морской навигации. Одинаково в обеих темах
const ACCENT = {
  50: '#fff8e6',
  100: '#feefc3',
  200: '#fde08a',
  300: '#fbcd52',
  400: '#f5b731',
  500: '#e8a01a',
  600: '#c98111',
  700: '#a06212',
  800: '#844e15',
  900: '#6d4116',
};

// Цвета статусов/категорий: светлые подложки в тёмной теме становятся приглушёнными оттенками,
// а тёмный текст — светлым. 400–600 не трогаем: это кнопки и иконки, они читаются на обоих фонах.
// Поэтому оттенки 700–900 используйте только для текста, а для фона кнопок — 500–600.
const TINTED = ['sky', 'blue', 'indigo', 'violet', 'pink', 'rose', 'red', 'orange', 'amber', 'yellow', 'emerald', 'green', 'teal', 'cyan'];
const TINT_SHADES = ['50', '100', '200', '300', '700', '800', '900'];

const darkTint = (scale, shade) => {
  const c500 = toRgb(scale[500]);
  switch (shade) {
    case '50': return blend(c500, SURFACE_DARK, 0.12);
    case '100': return blend(c500, SURFACE_DARK, 0.2);
    case '200': return blend(c500, SURFACE_DARK, 0.32);
    case '300': return blend(toRgb(scale[400]), SURFACE_DARK, 0.5);
    case '700': return toRgb(scale[300]);
    case '800': return toRgb(scale[200]);
    default: return toRgb(scale[100]);
  }
};

const varColor = (name, shade) => `rgb(var(--${name}-${shade}) / <alpha-value>)`;

const themedScale = (name, shades) =>
  Object.fromEntries(Object.entries(colors[name]).map(([shade, hex]) => [shade, shades.includes(shade) ? varColor(name, shade) : hex]));

const lightVars = { '--surface': '255 255 255' };
const darkVars = { '--surface': channels(SURFACE_DARK) };
Object.entries(colors.slate).forEach(([shade, hex]) => {
  lightVars[`--gray-${shade}`] = channels(GRAY_LIGHT_OVERRIDES[shade] ?? toRgb(hex));
  darkVars[`--gray-${shade}`] = channels(GRAY_DARK[shade]);
});
TINTED.forEach((name) => {
  TINT_SHADES.forEach((shade) => {
    lightVars[`--${name}-${shade}`] = channels(toRgb(colors[name][shade]));
    darkVars[`--${name}-${shade}`] = channels(darkTint(colors[name], shade));
  });
});

const themedColors = Object.fromEntries(TINTED.map((name) => [name, themedScale(name, TINT_SHADES)]));

module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    screens: {
      xs: '400px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        ...themedColors,
        primary: themedColors.blue,
        accent: ACCENT,
        // Тёмно-синий «корпус судна» — для текста на золотых кнопках и тёмных плашек
        navy: { 900: '#0b1b2e', 950: '#050d19' },
        gray: Object.fromEntries(Object.keys(colors.slate).map((shade) => [shade, varColor('gray', shade)])),
        // Фон карточек и панелей: белый днём, тёмно-синий ночью. text-white остаётся белым.
        surface: 'rgb(var(--surface) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        // Узкий гротеск для крупных заголовков и цифр — «судовая маркировка»
        display: ['Oswald', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)',
        pop: '0 10px 30px -10px rgba(15, 23, 42, 0.25)',
        beacon: '0 8px 24px -8px rgba(245, 183, 49, 0.55)',
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({
        ':root': { ...lightVars, colorScheme: 'light' },
        '.dark': { ...darkVars, colorScheme: 'dark' },
      });
    }),
  ],
};
