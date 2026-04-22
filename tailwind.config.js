/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#07112f",
          900: "#0a1a4e",
          800: "#0e2266",
          700: "#112a77",
          600: "#1535a0",
          500: "#1a42c8",
          400: "#4668d6",
          300: "#7a96e6",
          200: "#b3c4f3",
          100: "#d9e2f9",
          50:  "#eef2fc",
        }
      }
    }
  },
  plugins: []
};
