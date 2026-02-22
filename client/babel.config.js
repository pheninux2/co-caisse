module.exports = {
  presets: [
    ['@babel/preset-env', {
      targets:  { electron: '27' },
      modules:  'commonjs',   // ← convertit les import ESM en require()
    }],
  ],
  plugins: [
    '@babel/plugin-transform-class-properties',
  ],
};

