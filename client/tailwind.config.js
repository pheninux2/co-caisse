/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/renderer/index.html',
    './src/renderer/**/*.{js,html}',
  ],
  theme: {
    extend: {
      colors: {
        primary:   '#2563eb',
        secondary: '#64748b',
      },
    },
  },
  plugins: [],
};
