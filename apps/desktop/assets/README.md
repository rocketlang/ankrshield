# ankrshield Desktop App Assets

This directory contains assets used for building installers.

## Required Assets for Production Builds

### macOS (DMG)

- **icon.icns** - App icon in ICNS format (512x512, 256x256, 128x128, 64x64, 32x32, 16x16)
- **dmg-background.png** - DMG installer background image (540x380)

To create .icns from PNG:

```bash
# Using iconutil (macOS only)
mkdir icon.iconset
sips -z 16 16 icon-1024.png --out icon.iconset/icon_16x16.png
sips -z 32 32 icon-1024.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32 icon-1024.png --out icon.iconset/icon_32x32.png
sips -z 64 64 icon-1024.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128 icon-1024.png --out icon.iconset/icon_128x128.png
sips -z 256 256 icon-1024.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256 icon-1024.png --out icon.iconset/icon_256x256.png
sips -z 512 512 icon-1024.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512 icon-1024.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon-1024.png --out icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset
```

### Windows (Squirrel/NSIS)

- **icon.ico** - App icon in ICO format (256x256, 128x128, 64x64, 48x48, 32x32, 16x16)
- **install.gif** - Installation progress animation (optional)

To create .ico from PNG:

```bash
# Using ImageMagick
convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
```

### Linux (DEB/RPM)

- **icon.png** - App icon in PNG format (512x512 or 1024x1024)

### All Platforms

- **logo.png** - App logo for about screen, etc. (512x512)

## Current Status

For development builds, electron-forge will use default icons if these assets are missing.

For production/investor demo builds, proper branded assets should be created.

## Design Guidelines

- Use the ankrshield shield icon (🛡️) as the base
- Color scheme: Dark blue/purple gradients
- Clean, modern, minimal design
- Ensure icons are recognizable at small sizes (16x16)
