/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        aentc: {
          dark:   '#1a4d2e',
          medium: '#2d6a4f',
          light:  '#40916c',
          pale:   '#d8f3dc',
          bg:     '#f4f7f4',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
