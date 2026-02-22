/**
 * Co-Caisse — Webpack config (client)
 * Version : 2.0.0 — CommonJS
 */

const path              = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack           = require('webpack');
const dotenv            = require('dotenv');

dotenv.config();

module.exports = (env, argv) => {
  const isDev = argv && argv.mode === 'development';

  return {
    entry: './src/renderer/app.js',

    output: {
      filename:   'app.js',
      path:       path.resolve(__dirname, 'dist'),
      publicPath: '/',
    },

    module: {
      rules: [
        {
          // Transpile ESM → CJS — config dans babel.config.js
          test:    /\.js$/,
          exclude: /node_modules/,
          use:     'babel-loader',
        },
        // ── 2. CSS + PostCSS (Tailwind) ──────────────────────────────────────
        {
          test: /\.css$/i,
          use:  ['style-loader', 'css-loader', 'postcss-loader'],
        },
        // ── 3. Assets images ─────────────────────────────────────────────────
        {
          test: /\.(png|svg|jpg|jpeg|gif|webp|ico)$/i,
          type: 'asset/resource',
        },
      ],
    },

    plugins: [
      new HtmlWebpackPlugin({
        template: './src/renderer/index.html',
        filename: 'index.html',
      }),

      // Injecte API_URL dans le renderer — remplacé statiquement à la compilation
      new webpack.DefinePlugin({
        'process.env.API_URL': JSON.stringify(
          process.env.API_URL || 'http://localhost:5000'
        ),
      }),
    ],

    devServer: {
      port:               3000,
      hot:                true,
      historyApiFallback: true,
      // Permet de réutiliser le port immédiatement même s'il est en TIME_WAIT
      server: {
        type:    'http',
        options: { allowHalfOpen: false },
      },
      proxy: [
        {
          context:      ['/api'],
          target:       process.env.API_URL || 'http://localhost:5000',
          changeOrigin: true,
        },
      ],
    },

    devtool: isDev ? 'source-map' : false,
  };
};

