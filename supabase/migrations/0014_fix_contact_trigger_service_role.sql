-- AutoFair migration 0014 — fix contact-escalation trigger blocking service_role
--
-- Bug from 0013: prevent_contact_escalation() used public.is_admin() as the
-- only bypass. is_admin() checks profiles.role for auth.uid() — but the
-- service_role JWT has NO auth.uid(), so is_admin() is always false for it.
-- Result: POST /api/admin/staff → svc upsert role customer→staff + email
-- raised 42501 → profile setup failed (503 "Could not finish setting up...")
-- and the compensating cleanup deleted the just-created auth user.
--
-- Fix: service_role (and any no-uid backend context) bypasses the trigger.
-- Browser-user protection is unchanged: authenticated non-admin users still
-- cannot change role / is_active / last_assignment_at / email.

create or replace function public.prevent_contact_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jwt_role text := coalesce(nullif(auth.jwt()->>'role', ''), '');
begin
  -- Backend contexts bypass: service_role key, postgres/dashboard SQL, and
  -- admins acting through their own JWT. Only unprivileged browser users
  -- are restricted below.
  if v_jwt_role in ('service_role', 'postgres', 'supabase_admin') then
    return NEW;
  end if;
  if auth.uid() is null then
    return NEW;
  end if;
  if public.is_admin() then
    return NEW;
  end if;
  if NEW.role is distinct from OLD.role
     or NEW.is_active is distinct from OLD.is_active
     or NEW.last_assignment_at is distinct from OLD.last_assignment_at
     or NEW.email is distinct from OLD.email then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return NEW;
end;
$$;
