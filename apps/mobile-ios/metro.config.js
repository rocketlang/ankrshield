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
    // The @ankrshield/* backend packages use two Node builtins that RN lacks: `events`
    // (the events npm polyfill is installed) and `crypto` (only crypto.randomUUID — local shim).
    extraNodeModules: {
      events: require.resolve('events'),
      crypto: path.resolve(projectRoot, 'shims/crypto.js'),
    },
    // The @ankrshield/* packages are bundled from TS SOURCE (no build step), and their
    // source uses TS NodeNext `.js` extensions in relative imports (e.g.
    // `./iocs/stalkerware-packages.js` where the file is `.ts`). Metro doesn't map .js→.ts,
    // so strip the explicit .js and let Metro resolve the .ts/.tsx source.
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName.startsWith('.') && moduleName.endsWith('.js')) {
        try {
          return context.resolveRequest(context, moduleName.replace(/\.js$/, ''), platform);
        } catch (e) {
          // fall through to the default resolver below
        }
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(defaultConfig, config);
