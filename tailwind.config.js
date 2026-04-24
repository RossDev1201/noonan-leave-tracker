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
        noonan: {
          red:       "#c42032",
          "red-dark":"#a31c29",
          cream:     "#fef6e4",
          gray:      "#595959",
          warmgray:  "#77746d",
          silvergray:"#77787b",
          lightgray: "#ededed",
        },
        // kept for legacy references still in some files
        navy: {
          950: "#07112f",
          900: "#0a1a4e",
          800: "#0e2266",
          700: "#c42032",   // redirect to brand red
          600: "#a31c29",
          500: "#1a42c8",
          400: "#4668d6",
          300: "#c42032",
          200: "#fef6e4",
          100: "#fef6e4",
          50:  "#fef6e4",
        }
      },
      borderRadius: {
        none:    "0px",
        DEFAULT: "0px",
        sm:      "0px",
        md:      "0px",
        lg:      "0px",
        xl:      "0px",
        "2xl":   "0px",
        "3xl":   "0px",
        full:    "9999px",
      }
    }
  },
  plugins: []
};
