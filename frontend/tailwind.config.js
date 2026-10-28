/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: "#E6EAF0",
        "neu-text": "#1F2733",
        "neu-secondary": "#4A5568",
        accent: "#FF4F00",
        "accent-text": "#B33600",
        "neu-green": "#1E6B3E",
      },
      fontFamily: {
        sans: ['"Manrope Variable"', '"Manrope"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        control: '14px',
        slab: '28px',
      },
      fontSize: {
        'xs': '12px',
        'sm': '14px',
        'base': '16px',
        'lg': '20px',
        'xl': '28px',
        '2xl': '44px',
      },
    },
  },
  plugins: [],
}
