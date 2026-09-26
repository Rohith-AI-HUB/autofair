-- AutoFair migration 0018 — contact-form inquiries
-- The public /contact form accepts general queries that may have no LIVE
-- listing (no inspection id given, or the file is still pre-verification).
-- inquiries.listing_id was NOT NULL, which made such messages unstorable.
-- Rows are inserted server-side via service role, so no RLS policy changes.

begin;

alter table public.inquiries alter column listing_id drop not null;

commit;
