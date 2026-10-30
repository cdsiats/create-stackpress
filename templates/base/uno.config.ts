import { defineConfig, presetWind3 } from 'unocss';
import presetStackpress from 'stackpress/unocss';

export default defineConfig({
  content: {
    pipeline: {
      include: ['plugins/**/*.{js,ts,tsx}']
    }
  },
  presets: [presetWind3(), presetStackpress()]
});
