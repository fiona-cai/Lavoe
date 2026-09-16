-- Lavoe Supabase schema restore
-- Run in the Supabase SQL Editor (Dashboard → SQL → New query)

-- Tracks metadata (private; RLS by auth.uid())
create table if not exists public.tracks (
  track_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  object_key text not null,
  filename text not null,
  extension text,
  content_type text,
  size_bytes bigint,
  processing_type text,
  source_track_id uuid,
  duration_seconds double precision,
  sample_rate integer,
  channels integer,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists tracks_user_id_created_at_idx
  on public.tracks (user_id, created_at desc);

alter table public.tracks enable row level security;

drop policy if exists "Users can select own tracks" on public.tracks;
create policy "Users can select own tracks"
  on public.tracks for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own tracks" on public.tracks;
create policy "Users can insert own tracks"
  on public.tracks for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own tracks" on public.tracks;
create policy "Users can update own tracks"
  on public.tracks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own tracks" on public.tracks;
create policy "Users can delete own tracks"
  on public.tracks for delete
  using (auth.uid() = user_id);

-- Private audio bucket. Backend uses the service role key for uploads/signed URLs.
insert into storage.buckets (id, name, public)
values ('audio', 'audio', false)
on conflict (id) do nothing;

-- Allow authenticated users to read their own objects under users/<uid>/...
drop policy if exists "Users can read own audio objects" on storage.objects;
create policy "Users can read own audio objects"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'audio'
    and (storage.foldername(name))[1] = 'users'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
