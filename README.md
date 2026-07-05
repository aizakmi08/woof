# Woof

Woof is an Expo/React Native mobile app for scanning pet food and turning product labels, barcodes, and food photos into structured nutrition analysis. It combines mobile camera flows, Supabase-backed auth/history, and server-side AI analysis behind an Edge Function.

## Product Scope

- Scan pet food by barcode or photo.
- Analyze verified product data when available through Open Pet Food Facts.
- Fall back to AI-assisted analysis for product photos and human-food safety questions.
- Stream partial results into the UI so long-running analysis does not feel frozen.
- Persist scan history locally and sync it to Supabase for signed-in users.
- Gate premium flows through RevenueCat subscription integration.

## Tech Stack

- Expo and React Native
- React Navigation
- Supabase Auth, Postgres, Row Level Security, and Edge Functions
- Claude API through a server-side Supabase Edge Function
- Open Pet Food Facts lookup
- AsyncStorage for local persistence
- RevenueCat for subscriptions

## Architecture

```text
App.js
|-- screens/                  # Auth, onboarding, scanner, results, profile, paywall
|-- services/
|   |-- analysisService.js    # Background analysis singleton and pub/sub state
|   |-- claude.js             # Streaming API client
|   |-- opff.js               # Open Pet Food Facts lookup
|   |-- cache.js              # Supabase-backed analysis cache
|   |-- history.js            # Local and remote scan history
|   `-- purchases.js          # RevenueCat integration
`-- supabase/
    |-- functions/analyze/    # Server-side AI proxy and scoring prompts
    `-- migrations/           # Auth, history, rate limit, cache, and cleanup schema
```

## Notable Implementation Details

- Background analysis survives screen unmounts and supports multiple UI subscribers.
- Barcode results check cache and verified product data before invoking AI.
- Photo analysis uses a temporary key that is re-keyed once the product identity is known.
- Supabase RLS policies keep profile and history data scoped to the current user.
- The Edge Function keeps AI provider secrets off the mobile client.

## Local Setup

```bash
npm install
npm start
```

Create a local `.env` based on `.env.example`:

```bash
SUPABASE_URL=
SUPABASE_ANON_KEY=
GOOGLE_WEB_CLIENT_ID=
REVENUECAT_API_KEY_IOS=
REVENUECAT_API_KEY_ANDROID=
```

Deploy the Supabase Edge Function and migrations before testing full analysis flows.

## Quality Notes

The repository includes an audit document covering architecture, security, accessibility, and operational follow-ups. The public `.env.example` file is safe to commit; real keys should stay in local environment files or hosted secret managers.
