# ankrshield Desktop App - Installer Build Guide

Complete guide for building and distributing the FREE tier desktop app installers.

## Prerequisites

### All Platforms
- Node.js 18+ and pnpm
- Built app artifacts (run `pnpm build` first)

### macOS
- macOS 10.13+ (for building macOS installers)
- Xcode Command Line Tools
- Apple Developer account (for code signing)
- App-specific password (for notarization)

### Windows
- Windows 10+ or Wine (on Linux/macOS)
- Windows SDK (for signing)
- Code signing certificate (for production)

### Linux
- dpkg (for DEB packages)
- rpm-build (for RPM packages)

## Quick Start

```bash
# 1. Navigate to desktop app directory
cd apps/desktop

# 2. Install dependencies (if not already done)
pnpm install

# 3. Build the app
pnpm build

# 4. Package the app (creates distributable)
pnpm package

# 5. Create installers
pnpm make
```

## Build Commands

### Development Build
```bash
# Package app without installers (fastest)
pnpm package

# Output: out/ankrshield-darwin-arm64/ (or -x64, -win32, -linux)
```

### Production Installers
```bash
# Build all installers for current platform
pnpm make

# Output:
# - macOS: out/make/dmg/ankrshield-0.1.0.dmg
# - Windows: out/make/squirrel.windows/ankrshield-0.1.0-Setup.exe
# - Linux: out/make/deb/ankrshield_0.1.0_amd64.deb
#          out/make/rpm/ankrshield-0.1.0-1.x86_64.rpm
```

### Platform-Specific Builds
```bash
# macOS only
pnpm make --platform=darwin

# Windows only
pnpm make --platform=win32

# Linux only
pnpm make --platform=linux
```

## Code Signing (Production)

### macOS Code Signing

1. **Get Developer ID Certificate**
   - Enroll in Apple Developer Program ($99/year)
   - Download "Developer ID Application" certificate
   - Install in Keychain

2. **Set Environment Variables**
```bash
export APPLE_IDENTITY="Developer ID Application: Your Name (TEAM_ID)"
export APPLE_ID="your-apple-id@email.com"
export APPLE_ID_PASSWORD="app-specific-password"
export APPLE_TEAM_ID="YOUR_TEAM_ID"
```

3. **Build Signed DMG**
```bash
pnpm make --platform=darwin
```

4. **Verify Signature**
```bash
codesign -dv --verbose=4 out/make/dmg/ankrshield-0.1.0.dmg
spctl -a -vv out/make/dmg/ankrshield-0.1.0.dmg
```

### Windows Code Signing

1. **Get Code Signing Certificate**
   - Purchase from DigiCert, Sectigo, etc. (~$200-400/year)
   - Or use self-signed for testing

2. **Set Environment Variables**
```bash
export WINDOWS_CERTIFICATE_FILE="path/to/cert.pfx"
export WINDOWS_CERTIFICATE_PASSWORD="cert-password"
```

3. **Build Signed Installer**
```bash
pnpm make --platform=win32
```

## Distribution

### For Investor Demos

**Recommended: Direct Download**
```bash
# After building:
# 1. Upload to file host (S3, Dropbox, etc.)
# 2. Share direct download link
# 3. Or hand them a USB drive with the installer

# macOS: out/make/dmg/ankrshield-0.1.0.dmg
# Windows: out/make/squirrel.windows/ankrshield-0.1.0-Setup.exe
```

**Installation Instructions for Investors:**

macOS:
1. Download ankrshield-0.1.0.dmg
2. Open the DMG
3. Drag ankrshield to Applications
4. Open from Applications (right-click → Open first time)

Windows:
1. Download ankrshield-0.1.0-Setup.exe
2. Run the installer
3. Allow Windows SmartScreen (if unsigned)
4. Launch ankrshield

### For Public Beta Launch

1. **Product Hunt Launch**
   - Upload to GitHub Releases
   - Create landing page with download links
   - Submit to Product Hunt

2. **Direct Distribution**
   - Host on ankrshield.com/download
   - Track downloads with analytics
   - Collect email for updates

3. **Auto-Updates** (Future)
   - Already includes electron-updater
   - Configure update server
   - Push updates automatically

## Testing Installers

### macOS
```bash
# Install
open out/make/dmg/ankrshield-0.1.0.dmg
# Drag to Applications

# Test
/Applications/ankrshield.app/Contents/MacOS/ankrshield

# Uninstall
rm -rf /Applications/ankrshield.app
```

### Windows
```bash
# Install
out/make/squirrel.windows/ankrshield-0.1.0-Setup.exe

# Test
# Launch from Start Menu

# Uninstall
# Control Panel → Programs → Uninstall ankrshield
```

### Linux (DEB)
```bash
# Install
sudo dpkg -i out/make/deb/ankrshield_0.1.0_amd64.deb

# Test
ankrshield

# Uninstall
sudo apt remove ankrshield
```

## Troubleshooting

### Build Fails on macOS

**Error: "codesign: No identity found"**
- Solution: Remove osxSign from forge.config.js for unsigned builds
- Or: Install Developer ID certificate

**Error: "DMG background not found"**
- Solution: Create assets/dmg-background.png or remove from config
- Dimensions: 540x380

### Build Fails on Windows

**Error: "icon.ico not found"**
- Solution: Create assets/icon.ico or electron-forge will use default

**Error: "Wine not found"**
- Solution: Install Wine to build Windows installers on macOS/Linux
- `brew install wine-stable` (macOS)

### Build Fails on Linux

**Error: "dpkg-deb not found"**
- Solution: `sudo apt install dpkg` (Debian/Ubuntu)

**Error: "rpmbuild not found"**
- Solution: `sudo yum install rpm-build` (RedHat/Fedora)

## File Sizes

Expected installer sizes:

- **macOS DMG:** ~100-150 MB
- **Windows Installer:** ~120-180 MB
- **Linux DEB:** ~100-150 MB

Includes:
- Electron runtime (~50 MB)
- Node.js runtime (~30 MB)
- App bundle (~20 MB)
- Dependencies (~30-50 MB)

## Performance Checklist

Before building final installers:

- [ ] Build with production flags
- [ ] Minify renderer bundle (Vite does this automatically)
- [ ] Remove source maps from production builds
- [ ] Test app launch time (should be < 3 seconds)
- [ ] Test memory usage (should be < 150 MB idle)
- [ ] Test CPU usage (should be < 5% idle)
- [ ] Verify all IPC handlers work
- [ ] Check for console errors
- [ ] Test on clean machine

## Next Steps

1. ✅ Configure electron-forge (done)
2. ⏳ Create branded assets (icon.icns, icon.ico, etc.)
3. ⏳ Test package build
4. ⏳ Test installer creation
5. ⏳ Get code signing certificates (for production)
6. ⏳ Build signed installers
7. ⏳ Test on clean machines
8. ⏳ Distribute to investors

## Support

For build issues:
- Check electron-forge docs: https://www.electronforge.io
- Check Electron docs: https://www.electronjs.org
- Create issue in ankrshield repo

---

**Status:** Installer configuration complete, ready for test builds!
