console.warn('\nUsing custom webpack config (webpack.extra.config.js)\n');

// https://developers.cloudflare.com/workers/cli-wrangler/webpack/#bring-your-own-configuration
// https://github.com/cloudflare/modules-webpack-commonjs/blob/master/webpack.config.js
module.exports = {
  target: 'webworker',
  output: {
    libraryTarget: 'umd' // Fix: "Uncaught ReferenceError: exports is not defined".
  },
  resolve: {
    // https://webpack.js.org/configuration/resolve/#resolvefallback
    fallback: {
      https: require.resolve('https-browserify'),
      http: require.resolve('stream-http'),
      os: require.resolve('os-browserify/browser'),
      url: require.resolve('url'),
      util: require.resolve('util'),
      // buffer: require.resolve('buffer'),
      // path: require.resolve('path-browserify')
    }
  }
};
