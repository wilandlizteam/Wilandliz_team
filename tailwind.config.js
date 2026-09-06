/**
 * Tailwind supplies its base reset and a small number of utilities.
 * The design system itself is plain CSS in src/index.css.
 *
 * ESM syntax, because package.json declares "type": "module" — a
 * `module.exports` here is a CommonJS file in an ESM package, which only
 * worked by accident and can break on a different Node version.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: {} },
  plugins: [],
};
