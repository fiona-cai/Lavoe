# Restore Supabase for Lavoe

## What broke

Production auth points at `https://qnxlexticvkateirqutd.supabase.co`, which no longer resolves (DNS `NXDOMAIN`). That usually means the Supabase project was **deleted**, not just paused.

Separately, the Render backend (`lavoe-diqd.onrender.com`) returns **Service Suspended** and must be unsuspended or redeployed.

Until both are fixed, Google sign-in and track upload/storage will fail on [trylavoe.com](https://www.trylavoe.com/).

## Recreate checklist

### 1. New Supabase project

1. Create a project at [supabase.com](https://supabase.com/dashboard).
2. In **SQL Editor**, run [`supabase/migrations/001_tracks_and_storage.sql`](../supabase/migrations/001_tracks_and_storage.sql).
3. In **Authentication → Providers**, enable **Google** and set Client ID / Secret from Google Cloud Console.
4. In **Authentication → URL Configuration**, add redirect URLs:
   - `https://www.trylavoe.com/**`
   - `https://trylavoe.com/**`
   - `http://localhost:3000/**` (local)
5. In Google Cloud OAuth client, add authorized redirect URI:
   - `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`

### 2. Copy API keys

From **Project Settings → API**:

| Where | Variable |
| --- | --- |
| Vercel (frontend) | `NEXT_PUBLIC_SUPABASE_URL` |
| Vercel (frontend) | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Render (backend) | `SUPABASE_URL` |
| Render (backend) | `SUPABASE_ANON_KEY` |
| Render (backend) | `SUPABASE_SERVICE_ROLE_KEY` |
| Render (backend) | `SUPABASE_BUCKET=audio` |

Keep `NEXT_PUBLIC_API_BASE` / backend URL pointed at your live FastAPI host.

### 3. Redeploy

1. Unsuspend or redeploy the Render web service.
2. Redeploy Vercel after updating env vars (or trigger a redeploy so `NEXT_PUBLIC_*` values are baked in).
3. Smoke test: open the site → Sign in with Google → upload or generate a track → confirm it appears in Tracks.

### 4. Local verify

```bash
# frontend/.env.local  ← copy from frontend/env.example
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_API_BASE=http://localhost:8000

# backend/.env  ← copy from backend/env.example
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_BUCKET=audio
```

Then run backend + `npm run dev` as usual.
