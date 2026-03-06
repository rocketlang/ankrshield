# Play Store Screenshots

Required: 2–8 screenshots at 1080 × 1920px (or 9:16 aspect ratio).

## Planned shots (generate with Playwright / RN screenshot tool):

| File              | Screen                | Key highlight                            |
| ----------------- | --------------------- | ---------------------------------------- |
| 01-home.png       | HomeScreen            | 16 protection tiles + privacy score ring |
| 02-upi-guard.png  | UpiGuardScreen        | VPA risk analysis + safe/unsafe verdict  |
| 03-sms-shield.png | SmsShieldScreen       | Fraud SMS scan results                   |
| 04-network.png    | NetworkBehaviorScreen | DNS block count + sync status banner     |
| 05-av-scanner.png | AvScannerScreen       | APK scan in progress + results           |
| 06-anti-theft.png | AntiTheftScreen       | Device admin + last known location       |
| 07-dpdp.png       | DpdpScanScreen        | DPDP Act 2023 section scorecard          |
| 08-settings.png   | SettingsScreen        | Language picker + Bitwarden card         |

## Generate with:

```
npx playwright test --grep screenshot
# or
react-native-screenshot-testing --config screenshots.config.js
```

## Play Store graphic assets needed:

- Feature graphic: 1024 × 500px (see /assets/play-store-feature-graphic.png)
- Icon: 512 × 512px (see /assets/play-store-icon.png)
- TV banner: not needed (phone-only app)
