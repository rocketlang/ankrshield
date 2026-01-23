/**
 * Electron Forge Configuration
 * Configures installers for macOS, Windows, and Linux
 */

export default {
  packagerConfig: {
    name: 'ankrshield',
    executableName: 'ankrshield',
    icon: './assets/icon',
    appBundleId: 'com.ankrshield.desktop',
    appCategoryType: 'public.app-category.utilities',
    asar: true,
    extraResource: [
      // Include any extra resources here
    ],
    osxSign: {
      // macOS code signing (for production)
      identity: process.env.APPLE_IDENTITY,
      'hardened-runtime': true,
      'gatekeeper-assess': false,
      entitlements: 'entitlements.plist',
      'entitlements-inherit': 'entitlements.plist',
    },
    osxNotarize: process.env.APPLE_ID
      ? {
          appleId: process.env.APPLE_ID,
          appleIdPassword: process.env.APPLE_ID_PASSWORD,
          teamId: process.env.APPLE_TEAM_ID,
        }
      : undefined,
  },
  rebuildConfig: {},
  makers: [
    // macOS DMG Installer
    {
      name: '@electron-forge/maker-dmg',
      config: {
        name: 'ankrshield',
        title: 'ankrshield ${version}',
        background: './assets/dmg-background.png',
        icon: './assets/icon.icns',
        iconSize: 100,
        contents: (opts) => {
          return [
            { x: 130, y: 220, type: 'file', path: opts.appPath },
            { x: 410, y: 220, type: 'link', path: '/Applications' },
          ];
        },
        additionalDMGOptions: {
          window: {
            size: {
              width: 540,
              height: 380,
            },
          },
        },
      },
    },

    // Windows Squirrel Installer
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'ankrshield',
        title: 'ankrshield',
        authors: 'ankrshield Team',
        description: 'Privacy protection for your digital life',
        exe: 'ankrshield.exe',
        iconUrl: 'https://ankrshield.com/icon.ico',
        setupIcon: './assets/icon.ico',
        loadingGif: './assets/install.gif',
        noMsi: true,
      },
    },

    // Linux DEB Package (Ubuntu/Debian)
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          name: 'ankrshield',
          productName: 'ankrshield',
          genericName: 'Privacy Protection',
          description: 'Privacy protection for your digital life',
          categories: ['Utility', 'Security'],
          maintainer: 'ankrshield Team',
          homepage: 'https://ankrshield.com',
          icon: './assets/icon.png',
        },
      },
    },

    // Linux RPM Package (RedHat/Fedora)
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: {
          name: 'ankrshield',
          productName: 'ankrshield',
          genericName: 'Privacy Protection',
          description: 'Privacy protection for your digital life',
          categories: ['Utility', 'Security'],
          license: 'GPL-3.0',
          homepage: 'https://ankrshield.com',
          icon: './assets/icon.png',
        },
      },
    },

    // Generic ZIP (all platforms)
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux', 'win32'],
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
  ],
};
