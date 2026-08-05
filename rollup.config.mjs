import terser from '@rollup/plugin-terser';
import dts from 'rollup-plugin-dts';

const input = 'dist/esm/index.js';
const minify = terser({
  compress: { passes: 3 },
  mangle: {
    properties: { regex: /^_/ },
  },
  module: true,
});

export default [
  {
    input,
    output: [
      { file: 'dist/index.js', format: 'es' },
      { file: 'dist/index.cjs', format: 'cjs', exports: 'named' },
    ],
    plugins: [minify],
  },
  {
    input,
    output: {
      file: 'dist/index.umd.js',
      format: 'umd',
      name: 'typewriter',
      exports: 'named',
    },
  },
  {
    input,
    output: {
      file: 'dist/index.umd.min.js',
      format: 'umd',
      name: 'typewriter',
      exports: 'named',
    },
    plugins: [minify],
  },
  {
    input: 'dist/types/index.d.ts',
    output: [
      { file: 'dist/index.d.ts', format: 'es' },
      { file: 'dist/index.d.cts', format: 'es' },
    ],
    plugins: [dts()],
  },
];
