const { build } = require('./package.json');

module.exports = {
  ...build,
  extends: null,
  productName: 'CSBoard Local Test',
  directories: { ...build.directories, output: 'build/desktop-local' },
  extraMetadata: { csboardLocalModels: true },
  extraResources: [...build.extraResources, { from: '.local/official/maps', to: 'maps', filter: ['**/*.glb'] }],
};
