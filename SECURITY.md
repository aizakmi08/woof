# Security Policy

## Supported Version

Security fixes target the current `main` branch.

## Reporting

Please do not publish sensitive security details in a public issue. Use GitHub's private vulnerability reporting when available, or contact the maintainer through the GitHub profile with a short summary and reproduction outline.

## Security Notes

- Do not commit Supabase keys beyond public anon keys intended for the mobile client.
- Keep Claude/provider secrets in Supabase Edge Function secrets, not in the app bundle.
- Review Row Level Security migrations before changing profile, history, cache, or rate-limit behavior.
- Treat account deletion, scan history, subscription state, and generated analysis output as privacy-sensitive areas.
