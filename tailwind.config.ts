import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#171717",
        paper: "#f7f5ef",
        mint: "#88d4ab",
        coral: "#f36f5f",
        steel: "#49627a"
      },
      boxShadow: {
        panel: "0 18px 55px rgba(28, 37, 44, 0.12)"
      }
    }
  },
  plugins: []
};

export default config;
