import type { Config } from "tailwindcss";
import { preset } from "@app/ui/src/tailwind-preset";

export default {
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  presets: [preset as Config],
} satisfies Config;
