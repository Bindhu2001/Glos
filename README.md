# Glos Mobile App

Mobile application for Glos - Performance Management System

## Technology Stack
- React Native (Expo)
- TypeScript
- Clerk Authentication
- React Navigation

## Project Structure
```
mobile/
├── src/
│   ├── screens/
│   │   ├── auth/        # Authentication screens
│   │   ├── workspace/   # Workspace selection
│   │   ├── dashboard/   # Dashboard screens
│   │   └── ...
│   ├── navigation/      # Navigation configuration
│   ├── components/      # Reusable components
│   ├── contexts/        # React contexts
│   ├── hooks/           # Custom hooks
│   ├── api/             # API client
│   └── utils/           # Utilities
├── package.json
├── App.tsx              # Main entry point
└── eas.json             # EAS configuration
```

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Expo CLI
- Clerk account

### Installation
```bash
cd mobile
npm install
```

### Configuration
Create `.env` file:
```
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=your_key_here
EXPO_PUBLIC_API_URL=your_api_url_here
```

### Development
```bash
npm run start       # Start Expo
npm run android     # Run on Android
npm run ios         # Run on iOS
npm run web         # Run on Web
```

## Features
- User Authentication (Email/Password + Google OAuth)
- Workspace Selection
- Task Management
- Performance Reviews
- Dashboard
- Notifications
- Profile Management

## Authentication Flow

### Google OAuth Sign-In
1. User taps "Continue with Google"
2. System initiates Clerk OAuth flow
3. User authenticates with Google
4. Session established in Clerk
5. User redirected to workspace selection

### Email/Password
1. User enters email and password
2. Validated through Clerk
3. Session established
4. User redirected to workspace selection

## Recent Updates (Clerk Authentication Fix)

### Fixes Applied
- Enhanced JWT claim extraction for OAuth compatibility
- Improved SSO response handling for session establishment
- Better error messages and debugging capabilities
- Added state transition logging

### Testing
See `TESTING_GUIDE.md` for comprehensive testing procedures.

