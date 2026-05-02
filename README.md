# Taalreis

Taalreis is a Next.js implementation of the Claude Design handoff for a Dutch-first language-learning platform. The UI follows the exported `design_handoff_taalreis/taalreis-tokens.js` token system and is structured to deploy cleanly on Vercel with Supabase for authentication and persisted chapter data.

## Stack

- Next.js App Router
- React
- Supabase Auth + Postgres
- Vercel-ready filesystem layout

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Add your Supabase project URL and anon key.
4. Run the SQL in `supabase/schema.sql`.
5. Start the app with `npm run dev`.

## Supabase

- Email/password sign-in and Google OAuth are wired through Supabase.
- Chapter data is stored in `journey_chapters`.
- User preferences are stored in `profiles`.
- If Supabase env vars are missing, the app falls back to a demo mode so the UI still renders.

## Deployment

1. Import the repository into Vercel.
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Configure the Supabase Google provider callback to point at `/auth/callback`.
4. Deploy.
