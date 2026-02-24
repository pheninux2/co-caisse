const path    = require('path');
const HtmlWebpackPlugin    = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const webpack  = require('webpack');
const dotenv   = require('dotenv');

const env = dotenv.config().parsed || {};

module.exports = (_, argv) => {
  const isDev = argv.mode === 'development';

  return {
    entry:  './src/renderer/app.js',
    output: {
      path:     path.resolve(__dirname, 'dist'),
      filename: 'app.js',
      clean:    true,
    },
    devServer: {
      port:               4000,
      hot:                true,
      historyApiFallback: { index: '/index.html' },
      static:             path.resolve(__dirname, 'dist'),
    },
    module: {
      rules: [
        {
          test:    /\.js$/,
          exclude: /node_modules/,
          use: {
            loader:  'babel-loader',
            options: { presets: [['@babel/preset-env', { targets: { electron: '27' }, modules: 'commonjs' }]] },
          },
        },
        {
          test: /\.css$/,
          use:  isDev
            ? ['style-loader', 'css-loader']
            : [MiniCssExtractPlugin.loader, 'css-loader'],
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './src/renderer/index.html',
        filename: 'index.html',
      }),
      new MiniCssExtractPlugin({ filename: 'styles.css' }),
      new webpack.DefinePlugin({
        'process.env.ADMIN_API_URL': JSON.stringify(env.ADMIN_API_URL || 'http://localhost:5000'),
      }),
    ],
    resolve: { extensions: ['.js'] },
  };
};

