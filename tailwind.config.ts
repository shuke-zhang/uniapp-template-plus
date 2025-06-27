/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.vue'],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        primary: '#49b9ad',
      },
      fontSize: {
      },
    },
  },
  plugins: [
  ],

}
