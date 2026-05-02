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

## Supabase backend exact setup

Volg deze stappen precies:

1. **Maak een Supabase project**
   - Ga naar Supabase Dashboard → **New project**.
   - Kies een regio dicht bij je gebruikers.

2. **Haal de project-keys op**
   - In Supabase: **Project Settings → API**.
   - Kopieer:
     - `URL`
     - `anon public key`

3. **Configureer lokale env**
   - Maak (of update) `.env.local` in de project root:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co"
   NEXT_PUBLIC_SUPABASE_ANON_KEY="<your-anon-key>"
   ```

4. **Voer het database schema uit**
   - In Supabase: **SQL Editor → New query**.
   - Plak de inhoud van `supabase/schema.sql` en run die.
   - Dit maakt:
     - `public.profiles`
     - `public.journey_chapters`
     - RLS policies per gebruiker

5. **Configureer auth providers**
   - **Email/Password**: laat aan staan in **Authentication → Providers**.
   - **Google OAuth** (optioneel, maar in app ondersteund):
     - Zet Google provider aan.
     - Voeg je Google Client ID/Secret toe.

6. **Auth redirect URLs instellen**
   - In Supabase: **Authentication → URL Configuration**.
   - Zet:
     - Site URL (lokaal): `http://localhost:3000`
     - Additional redirect URL: `http://localhost:3000/auth/callback`
   - Voor productie voeg je ook je Vercel URL toe met `/auth/callback`.

7. **Start en controleer lokaal**
   - Start app: `npm run dev`
   - Log in met email/password of Google.
   - Controleer in Supabase Table Editor dat records verschijnen in `profiles` en `journey_chapters`.

## Wat wordt opgeslagen in de backend?

De app slaat nu per gebruiker het volgende op:

1. **Profiel + instellingen (`profiles`)**
   - `user_id` (link naar `auth.users`)
   - `full_name`
   - `interface_language` (`nl` of `en`)
   - `level`
   - `notifications_enabled`
   - `created_at`, `updated_at`

2. **Reis/hoofdstukken (`journey_chapters`)**
   - `id` (chapter-id)
   - `user_id` (owner)
   - `chapter_number` (bijv. `01`, `02`)
   - `title`
   - `progress_percent` (0-100)
   - `total_words`
   - `is_done`, `is_active`
   - `sort_order`
   - `created_at`, `updated_at`

3. **Authenticatie (Supabase Auth)**
   - User account-data staat in `auth.users` (beheer door Supabase).

## Hoe synchronisatie werkt

Synchronisatie is nu server-first via Next.js server actions:

1. **Schrijven naar backend**
   - Bij hoofdstuk-wijzigingen gebruikt de app `addChapterAction` (`lib/actions.ts`) en doet een `upsert` naar `journey_chapters`.
   - Bij settings-wijzigingen gebruikt de app `saveSettingsAction` en doet een `upsert` naar `profiles`.

2. **Per-user isolatie met RLS**
   - Row Level Security staat aan op beide tabellen.
   - Policies laten alleen `auth.uid() = user_id` lezen/schrijven.
   - Daardoor ziet en wijzigt elke gebruiker alleen eigen data.

3. **UI refresh na write**
   - Na succesvolle writes draait `revalidatePath("/")`, zodat de server-rendered data op de homepage wordt ververst.

4. **Fallback modus zonder env vars**
   - Als Supabase env vars ontbreken, draait de app in demo mode (UI blijft bruikbaar, maar zonder echte persistente sync).

## Deployment

1. Import the repository into Vercel.
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Configure the Supabase Google provider callback to point at `/auth/callback`.
4. Deploy.
