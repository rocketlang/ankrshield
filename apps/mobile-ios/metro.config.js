const { getDefaultConfig } = require('expo/metro-config');
const { mergeConfig } = require('@react-native/metro-config');
const path = require('path');

/**
 * Metro configuration for pnpm monorepo with Expo SDK 50.
 * Uses expo/metro-config for correct asset hashing.
 * Adds pnpm virtual store to watchFolders/nodeModulesPaths.
 *
 * @ankrshield/android-monitor uses a mobile-compatible shim
 * at node_modules/@ankrshield/android-monitor/ (crypto polyfilled).
 */

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');
const pnpmStore = path.resolve(monorepoRoot, 'node_modules/.pnpm');

const defaultConfig = getDefaultConfig(projectRoot);

const config = {
  watchFolders: [monorepoRoot, pnpmStore],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(monorepoRoot, 'node_modules'),
      pnpmStore,
    ],
    unstable_enableSymlinks: true,
    disableHierarchicalLookup: false,
  },
};

module.exports = mergeConfig(defaultConfig, config);
