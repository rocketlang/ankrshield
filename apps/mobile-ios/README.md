# ankrshield Mobile (iOS)

Privacy & AI Security mobile application for iOS, built with React Native.

## Features

- Real-time privacy score monitoring
- Network activity tracking
- DNS query filtering
- Tracker blocking
- Detailed analytics dashboard
- Privacy alerts and notifications

## Prerequisites

- Node.js 18+
- React Native development environment
- Xcode (for iOS development)
- CocoaPods

## Installation

```bash
# Install dependencies
npm install

# Install iOS dependencies
cd ios && pod install && cd ..
```

## Development

```bash
# Start Metro bundler
npm start

# Run on iOS
npm run ios

# Run on Android
npm run android
```

## Build

```bash
# Build for iOS
npm run build:ios

# Build for Android
npm run build:android
```

## Project Structure

```
apps/mobile-ios/
├── src/
│   ├── screens/         # App screens
│   │   ├── HomeScreen.tsx
│   │   ├── DashboardScreen.tsx
│   │   ├── ActivityScreen.tsx
│   │   └── SettingsScreen.tsx
│   ├── components/      # Reusable components
│   │   ├── PrivacyScoreCircle.tsx
│   │   └── StatsCard.tsx
│   ├── services/        # API services
│   │   ├── PrivacyService.ts
│   │   └── NetworkService.ts
│   └── stores/          # State management
├── App.tsx             # Root component
├── index.js            # Entry point
└── package.json
```

## API Integration

The mobile app connects to the ankrshield API server running on port 4250.

Update `API_BASE_URL` in service files to point to your API server.

## Testing

```bash
npm test
```

## License

TBD
