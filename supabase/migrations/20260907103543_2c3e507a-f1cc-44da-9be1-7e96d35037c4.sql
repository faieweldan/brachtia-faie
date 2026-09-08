ALTER TABLE public.availability_rules ADD COLUMN IF NOT EXISTS capacity_group integer NOT NULL DEFAULT 1;
ALTER TABLE public.blocked_dates ADD COLUMN IF NOT EXISTS start_time time without time zone;
ALTER TABLE public.blocked_dates ADD COLUMN IF NOT EXISTS end_time time without time zone;