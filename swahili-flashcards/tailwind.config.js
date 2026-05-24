/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        kenya: {
          red: '#BB0000',
          green: '#006600',
          black: '#000000',
        },
      },
    },
  },
  plugins: [],
};
