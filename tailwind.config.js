/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class', // ← habilita dark mode por classe no <html>
  theme: {
    extend: {},
  },
  plugins: [],
};
