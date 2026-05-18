/**
 * Electron Forge Configuration — DEV RUNNER ONLY
 *
 * Packaging/installers are owned by electron-builder (see electron-builder.yml).
 * This config is kept only because `pnpm dev` / `pnpm start` use `electron-forge start`
 * to launch the app against the renderer dev server. No makers here on purpose.
 *
 * If you migrate dev to `electron .` directly, this file can be deleted.
 */

export default {
  packagerConfig: {
    name: 'ankrshield',
    executableName: 'ankrshield',
    icon: './assets/icon',
    appBundleId: 'com.ankrshield.desktop',
    appCategoryType: 'public.app-category.utilities',
    asar: true,
    extraResource: [],
    // Needed when running dev as root (CI sandboxes)
    executableArgs: ['--no-sandbox'],
  },
  rebuildConfig: {},
  makers: [],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
  ],
};
