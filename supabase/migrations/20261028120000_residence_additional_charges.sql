-- ===========================================================================
-- Schedule B clause 11, Additional Charges, per residence (28 Oct 2026).
--
-- Each residence's Schedule B has its own prices - The Arc's lost card is
-- RM60, Solstice's RM50. The list was one list in the code (charge-list.ts),
-- so every residence was charged The Arc's. Now it is the residence's own,
-- set in Admin > Website > Residences > Terms & fees:
--   [{"label": "Residence access card (lost)", "amount": 60}, ...]
-- amount null = "reasonable cost" - admin types it on the invoice.
-- The invoice picker, the checkout deductions, the access card replacement and
-- the Update Tenancy fees read the resident's residence's list.
--
-- Filled once from each residence's Schedule B (The Arc vOct13, Solstice
-- 27 Oct), only where the list is still empty. Safe to run again.
-- ===========================================================================

alter table public.residences
  add column if not exists additional_charges jsonb not null default '[]'::jsonb;

update public.residences set additional_charges = '[
  {"label": "Resident-requested room/unit change", "amount": 100},
  {"label": "Additional access card following room/unit change", "amount": 20},
  {"label": "Lost/damaged room key", "amount": 15},
  {"label": "Residence access card (lost)", "amount": 60},
  {"label": "Residence access card (damaged)", "amount": 30},
  {"label": "Car access card (lost)", "amount": 125},
  {"label": "Car access card (damaged)", "amount": 65},
  {"label": "Car sticker (application/lost/damaged)", "amount": 15},
  {"label": "Lockout assistance (Mon-Fri, 9.00 a.m.-5.00 p.m.)", "amount": 10},
  {"label": "Lockout assistance (after 5.00 p.m., weekends/public holidays)", "amount": 20},
  {"label": "Additional room cleaning", "amount": 30},
  {"label": "Additional communal-area cleaning", "amount": 100},
  {"label": "Mandatory basic move-out cleaning", "amount": 60},
  {"label": "Air-conditioning servicing", "amount": 120},
  {"label": "Damage or missing items", "amount": null},
  {"label": "Deep cleaning/restoration/removal/disposal", "amount": null},
  {"label": "Utility late-payment/reconnection charges", "amount": null}
]'::jsonb
where slug = 'the-arc-cyberjaya' and additional_charges = '[]'::jsonb;

update public.residences set additional_charges = '[
  {"label": "Resident-requested room/unit change", "amount": 100},
  {"label": "Additional access card following room/unit change", "amount": 50},
  {"label": "Lost/damaged room key", "amount": 15},
  {"label": "Residence access card (lost)", "amount": 50},
  {"label": "Residence access card (damaged)", "amount": 50},
  {"label": "Lockout assistance (Mon-Fri, 9.00 a.m.-5.00 p.m.)", "amount": 30},
  {"label": "Lockout assistance (after 5.00 p.m., weekends/public holidays)", "amount": 60},
  {"label": "Additional room cleaning", "amount": 30},
  {"label": "Additional communal-area cleaning", "amount": 100},
  {"label": "Mandatory basic move-out cleaning", "amount": 120},
  {"label": "Air-conditioning servicing", "amount": 120},
  {"label": "Damage or missing items", "amount": null},
  {"label": "Deep cleaning/restoration/removal/disposal", "amount": null},
  {"label": "Utility late-payment/reconnection charges", "amount": null}
]'::jsonb
where slug = 'solstice-residence-cyberjaya' and additional_charges = '[]'::jsonb;
