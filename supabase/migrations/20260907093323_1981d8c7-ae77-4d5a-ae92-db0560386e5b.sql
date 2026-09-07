ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS resident_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS history jsonb NOT NULL DEFAULT '[]'::jsonb;