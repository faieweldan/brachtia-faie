ALTER TABLE public.enquiries ADD COLUMN IF NOT EXISTS unit_type text NOT NULL DEFAULT '';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS invoice_date date;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_terms text NOT NULL DEFAULT 'NET15';