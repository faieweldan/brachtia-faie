CREATE SEQUENCE IF NOT EXISTS public.invoice_ref_seq;
CREATE SEQUENCE IF NOT EXISTS public.receipt_ref_seq;

CREATE OR REPLACE FUNCTION public.next_invoice_reference()
RETURNS text LANGUAGE sql SET search_path TO 'public' AS $$
  SELECT 'INV-' || to_char(now(), 'DDMMYY') || '-' || lpad(nextval('public.invoice_ref_seq')::text, 4, '0')
$$;

CREATE OR REPLACE FUNCTION public.next_receipt_reference()
RETURNS text LANGUAGE sql SET search_path TO 'public' AS $$
  SELECT 'RCT-' || to_char(now(), 'DDMMYY') || '-' || lpad(nextval('public.receipt_ref_seq')::text, 4, '0')
$$;

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL DEFAULT public.next_invoice_reference(),
  enquiry_id uuid REFERENCES public.enquiries(id) ON DELETE SET NULL,
  resident_id text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'issued',
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  university text NOT NULL DEFAULT '',
  nationality text NOT NULL DEFAULT '',
  residence_name text NOT NULL DEFAULT '',
  room_name text NOT NULL DEFAULT '',
  occupancy text NOT NULL DEFAULT '',
  tenancy_start date,
  tenancy_end date,
  monthly_rent numeric NOT NULL DEFAULT 0,
  payment_frequency text NOT NULL DEFAULT 'bimonthly',
  total numeric NOT NULL DEFAULT 0,
  deposits_total numeric NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage invoices" ON public.invoices FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

CREATE TABLE public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'fee',
  amount numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_items TO authenticated;
GRANT ALL ON public.invoice_items TO service_role;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage invoice items" ON public.invoice_items FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  enquiry_id uuid REFERENCES public.enquiries(id) ON DELETE SET NULL,
  resident_id text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  paid_on date NOT NULL DEFAULT current_date,
  method text NOT NULL DEFAULT '',
  reference text NOT NULL DEFAULT '',
  proof_path text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage payments" ON public.payments FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

CREATE TABLE public.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL DEFAULT public.next_receipt_reference(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  enquiry_id uuid REFERENCES public.enquiries(id) ON DELETE SET NULL,
  resident_id text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  balance_after numeric NOT NULL DEFAULT 0,
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipts TO authenticated;
GRANT ALL ON public.receipts TO service_role;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage receipts" ON public.receipts FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

CREATE INDEX invoices_enquiry_idx ON public.invoices(enquiry_id);
CREATE INDEX invoice_items_invoice_idx ON public.invoice_items(invoice_id);
CREATE INDEX payments_invoice_idx ON public.payments(invoice_id);
CREATE INDEX receipts_invoice_idx ON public.receipts(invoice_id);