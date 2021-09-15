const path = require('path');
const webpack = require('webpack');

module.exports = /** @type WebpackConfig */ {
  context: path.dirname(__dirname),
  mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')
  target: 'webworker', // extensions run in a webworker context
  entry: {
    extension: path.dirname(__dirname)+'/vscode-solidity-metrics/src/extension.js', // source of the web extension main file
  },
  output: {
    filename: 'out.js',
    path: path.join(__dirname, '/dist/web'),
    libraryTarget: 'commonjs'
  },
  resolve: {
    mainFields: ['browser', 'module', 'main'], // look for `browser` entry point in imported node modules
    extensions: ['.js'], // support ts-files and js-files
    alias: {
      // provides alternate implementation for node module and source files
    },
    fallback: {
      // Webpack 5 no longer polyfills Node.js core modules automatically.
      // see https://webpack.js.org/configuration/resolve/#resolvefallback
      // for the list of Node.js core module polyfills.
      "child_process": false,
      assert: require.resolve('assert'),
      "crypto": require.resolve("crypto-browserify"),
      "stream": require.resolve("stream-browserify"),
      'fs': require.resolve('browserfs/dist/shims/fs.js'),
        'buffer': require.resolve('browserfs/dist/shims/buffer.js'),
        'path': require.resolve('browserfs/dist/shims/path.js'),
        'processGlobal': require.resolve('browserfs/dist/shims/process.js'),
        'bufferGlobal': require.resolve('browserfs/dist/shims/bufferGlobal.js'),
    }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
        ]
      }
    ]
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: 'process/browser' // provide a shim for the global `process` variable
    })
  ],
  externals: {
    vscode: 'commonjs vscode' // ignored because it doesn't exist
  },
  performance: {
    hints: false
  },
  devtool: 'nosources-source-map' // create a source map that points to the original source file
};