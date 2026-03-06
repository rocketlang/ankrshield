#!/usr/bin/env bash
# =============================================================================
# AnkrShield White-Label Build Script
# Usage:
#   ./scripts/build-whitelabel.sh --partner bsnl   [--variant debug|release]
#   ./scripts/build-whitelabel.sh --partner airtel [--variant release]
#   ./scripts/build-whitelabel.sh --partner sbi    [--variant release]
#   ./scripts/build-whitelabel.sh --partner default
#
# Environment:
#   KEYSTORE_PATH     — path to .jks keystore (release builds only)
#   KEYSTORE_ALIAS    — keystore alias
#   KEYSTORE_PASS     — keystore password
#
# Output: android/app/build/outputs/apk/<variant>/<partner>-ankrshield-<version>.apk
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(dirname "$SCRIPT_DIR")"
ANDROID_DIR="$MOBILE_DIR/android"

# ── Defaults ──────────────────────────────────────────────────────────────────
PARTNER="default"
VARIANT="release"

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --partner) PARTNER="$2"; shift 2 ;;
    --variant) VARIANT="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

echo "╔══════════════════════════════════════════════════╗"
echo "║  AnkrShield White-Label Builder                  ║"
echo "║  Partner : $PARTNER"
echo "║  Variant : $VARIANT"
echo "╚══════════════════════════════════════════════════╝"

# ── Partner manifest ──────────────────────────────────────────────────────────
# Each partner entry defines: PACKAGE_ID, APP_NAME, API_BASE_URL, ACCENT_COLOR
declare -A PACKAGE_ID APP_NAME API_BASE_URL ACCENT_COLOR SPLASH_COLOR

PACKAGE_ID[default]="com.ankr.shield"
APP_NAME[default]="AnkrShield"
API_BASE_URL[default]="https://xshieldai.com/api"
ACCENT_COLOR[default]="#00C2A8"
SPLASH_COLOR[default]="#0F172A"

PACKAGE_ID[bsnl]="in.bsnl.secureconnect"
APP_NAME[bsnl]="BSNL SecureConnect"
API_BASE_URL[bsnl]="https://secureconnect.bsnl.in/api"
ACCENT_COLOR[bsnl]="#FF6600"
SPLASH_COLOR[bsnl]="#003366"

PACKAGE_ID[airtel]="com.airtel.safenet"
APP_NAME[airtel]="Airtel SafeNet"
API_BASE_URL[airtel]="https://safenet.airtel.in/api"
ACCENT_COLOR[airtel]="#E40000"
SPLASH_COLOR[airtel]="#E40000"

PACKAGE_ID[sbi]="in.sbi.shield"
APP_NAME[sbi]="SBI Shield"
API_BASE_URL[sbi]="https://shield.sbi.co.in/api"
ACCENT_COLOR[sbi]="#1A3D7C"
SPLASH_COLOR[sbi]="#1A3D7C"

if [[ -z "${PACKAGE_ID[$PARTNER]+x}" ]]; then
  echo "ERROR: Unknown partner '$PARTNER'. Valid: ${!PACKAGE_ID[*]}"
  exit 1
fi

PKG="${PACKAGE_ID[$PARTNER]}"
NAME="${APP_NAME[$PARTNER]}"
API="${API_BASE_URL[$PARTNER]}"
COLOR="${ACCENT_COLOR[$PARTNER]}"
SPLASH="${SPLASH_COLOR[$PARTNER]}"

echo ""
echo "→ Package ID : $PKG"
echo "→ App Name   : $NAME"
echo "→ API Base   : $API"

# ── Step 1: Patch strings.xml (app name) ─────────────────────────────────────
STRINGS_XML="$ANDROID_DIR/app/src/main/res/values/strings.xml"
echo ""
echo "[1/5] Patching strings.xml → app_name='$NAME'"

# Use Python for reliable XML editing without xmlstarlet dependency
python3 - "$STRINGS_XML" "$NAME" <<'PYEOF'
import sys, re
path, name = sys.argv[1], sys.argv[2]
with open(path, 'r') as f:
    content = f.read()
content = re.sub(
    r'(<string name="app_name">)[^<]*(</string>)',
    rf'\g<1>{name}\g<2>',
    content
)
with open(path, 'w') as f:
    f.write(content)
print(f"  strings.xml → app_name = '{name}'")
PYEOF

# ── Step 2: Patch build.gradle (applicationId) ───────────────────────────────
BUILD_GRADLE="$ANDROID_DIR/app/build.gradle"
echo "[2/5] Patching build.gradle → applicationId='$PKG'"

python3 - "$BUILD_GRADLE" "$PKG" <<'PYEOF'
import sys, re
path, pkg = sys.argv[1], sys.argv[2]
with open(path, 'r') as f:
    content = f.read()
content = re.sub(
    r'(applicationId\s+")[^"]*(")',
    rf'\g<1>{pkg}\g<2>',
    content
)
with open(path, 'w') as f:
    f.write(content)
print(f"  build.gradle → applicationId = '{pkg}'")
PYEOF

# ── Step 3: Write .env.brand for Metro (BRAND_PARTNER + overrides) ────────────
ENV_FILE="$MOBILE_DIR/.env.brand"
echo "[3/5] Writing .env.brand for Metro bundler"
cat > "$ENV_FILE" <<EOF
BRAND_PARTNER=$PARTNER
ANKRSHIELD_API_URL=$API
EOF
echo "  .env.brand written → BRAND_PARTNER=$PARTNER"

# ── Step 4: Copy partner logo (if exists) ────────────────────────────────────
ASSETS_DIR="$MOBILE_DIR/assets"
LOGO_SRC="$ASSETS_DIR/partners/$PARTNER-logo.png"
LOGO_DST="$ASSETS_DIR/partner-logo.png"
echo "[4/5] Partner logo"
if [[ -f "$LOGO_SRC" ]]; then
  cp "$LOGO_SRC" "$LOGO_DST"
  echo "  Copied $PARTNER-logo.png → assets/partner-logo.png"
else
  echo "  No partner logo found at $LOGO_SRC — using default icon"
fi

# ── Step 5: Gradle build ─────────────────────────────────────────────────────
echo "[5/5] Building Android ($VARIANT)…"
cd "$ANDROID_DIR"

GRADLE_TASK=""
if [[ "$VARIANT" == "release" ]]; then
  GRADLE_TASK="assembleRelease"
else
  GRADLE_TASK="assembleDebug"
fi

# Pass signing config via env if release
if [[ "$VARIANT" == "release" ]]; then
  if [[ -z "${KEYSTORE_PATH:-}" || -z "${KEYSTORE_ALIAS:-}" || -z "${KEYSTORE_PASS:-}" ]]; then
    echo ""
    echo "WARNING: Release build without KEYSTORE_PATH / KEYSTORE_ALIAS / KEYSTORE_PASS."
    echo "         APK will be unsigned. Set env vars for production builds."
    echo ""
  fi
fi

./gradlew "$GRADLE_TASK" \
  -PbrandPartner="$PARTNER" \
  -PbrandApiUrl="$API" \
  --no-daemon \
  2>&1 | tail -20

# ── Locate and rename output APK ──────────────────────────────────────────────
APK_DIR="$ANDROID_DIR/app/build/outputs/apk/$VARIANT"
ORIG_APK=$(find "$APK_DIR" -name "*.apk" | head -1)

VERSION=$(node -p "require('$MOBILE_DIR/package.json').version" 2>/dev/null || echo "0.0.0")
OUT_APK="$APK_DIR/${PARTNER}-ankrshield-${VERSION}.apk"

if [[ -f "$ORIG_APK" ]]; then
  mv "$ORIG_APK" "$OUT_APK"
  SIZE=$(du -sh "$OUT_APK" | cut -f1)
  echo ""
  echo "✓ Build complete"
  echo "  APK  : $OUT_APK"
  echo "  Size : $SIZE"
else
  echo "ERROR: APK not found in $APK_DIR"
  exit 1
fi

# ── Step 6: Restore originals (leave repo clean for next build) ───────────────
echo ""
echo "Restoring patched files to default values…"
cd "$MOBILE_DIR"

git checkout -- "$STRINGS_XML" "$BUILD_GRADLE" 2>/dev/null || true
rm -f "$ENV_FILE"
echo "Done. Working tree restored."
