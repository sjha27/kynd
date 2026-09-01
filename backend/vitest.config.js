'use strict';

const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
