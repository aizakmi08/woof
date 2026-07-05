# Contributing to Woof

Woof is an Expo/React Native scanner app with Supabase auth/history, Edge Function analysis, caching, and subscription scaffolding.

## Local Setup

```bash
npm install
npm start
```

Create local environment values from the README before testing full auth, analysis, or subscription flows.

## Quality Bar

- Run `npm run verify` before committing structural changes.
- Keep API keys and provider credentials out of the mobile client and repository.
- Treat scanner, analysis, cache, history, auth, and paywall changes as product-critical flows.
- Keep Supabase migrations ordered and documented by filename.
- Update `README.md` when setup, environment, or Edge Function behavior changes.

## Pull Request Notes

Include the user flow affected, the validation performed, and any backend/Supabase migration impact.
