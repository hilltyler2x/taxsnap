import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        emerald: {
          400: "#5DCAA5",
          500: "#1D9E75",
          600: "#0F6E56",
          700: "#085041",
        },
      },
    },
  },
  plugins: [],
}

export default config
