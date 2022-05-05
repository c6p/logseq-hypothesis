import { defineConfig } from "vite";
import { createVuePlugin } from "vite-plugin-vue2";

const config = defineConfig({
  base: "",
  build: {
    minify: true,
  },
  plugins: [createVuePlugin({})],
});

export default config;
