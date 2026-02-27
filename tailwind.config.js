/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Cinzel', 'serif'],
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        gold: {
          50: '#fdf9ee',
          100: '#f9efcc',
          200: '#f3dd96',
          300: '#ecc558',
          400: '#e6b230',
          500: '#C9A84C',
          600: '#a87c28',
          700: '#8B6914',
          800: '#6b4f18',
          900: '#5a421a',
        },
      },
    },
  },
  plugins: [],
};
