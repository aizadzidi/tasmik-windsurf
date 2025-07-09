/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/app/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          light: '#7c3aed', // purple-500
          DEFAULT: '#4f46e5', // indigo-600
          dark: '#312e81', // indigo-900
        },
        secondary: {
          light: '#0ea5e9', // sky-500
          DEFAULT: '#0369a1', // sky-800
          dark: '#0c4a6e', // sky-900
        },
        gradientPurple: '#7c3aed',
        gradientBlue: '#0ea5e9',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(ellipse at top left, #7c3aed 0%, #0ea5e9 100%)',
        'gradient-linear': 'linear-gradient(135deg, #7c3aed 0%, #0ea5e9 100%)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
