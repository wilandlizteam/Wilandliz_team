/**
 * Tailwind is used only for its base reset and a handful of utilities.
 * The design system lives in src/index.css as plain, readable CSS.
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: {} },
  plugins: [],
};
