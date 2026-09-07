ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS residence_slugs text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS residence_names text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS move_in date,
  ADD COLUMN IF NOT EXISTS move_out date,
  ADD COLUMN IF NOT EXISTS sharing_preference text NOT NULL DEFAULT '';