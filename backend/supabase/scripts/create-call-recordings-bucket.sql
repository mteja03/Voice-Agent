-- Run in Supabase SQL Editor once. Creates a private bucket for per-call audio artifacts.
-- Backend uploads with the service role; the API issues short-lived signed URLs for playback.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'call-recordings',
  'call-recordings',
  false,
  52428800,
  array['audio/wav', 'audio/webm', 'audio/mpeg', 'audio/mp4', 'application/octet-stream']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Optional: allow authenticated users to read only via signed URLs (service role bypasses RLS for uploads).
-- No policy needed for public read; signed URLs are generated server-side.
