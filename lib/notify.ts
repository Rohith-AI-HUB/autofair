import { getServiceClient } from '@/lib/supabase/service';
import { logDbError } from '@/lib/errors/db-error';
import { sendEmail } from '@/lib/email';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.autofair.online';

/**
 * Email the assigned staff member about a new inspection file.
 * Fire-and-forget: never throws, never blocks or reverses an assignment.
 */
export async function notifyStaffAssigned(vehicleId: string, staffId: string | null): Promise<void> {
  if (!staffId) return;
  try {
    const svc = getServiceClient();
    if (!svc) return;
    const [{ data: staff }, { data: vehicle }] = await Promise.all([
      svc.from('profiles').select('email, full_name').eq('id', staffId).maybeSingle(),
      svc
        .from('vehicles')
        .select('inspection_id, reg_number, make, model, year, location')
        .eq('id', vehicleId)
        .maybeSingle(),
    ]);
    const email = (staff as { email?: string | null } | null)?.email;
    if (!email) return;
    const v = vehicle as
      | { inspection_id: string; reg_number: string; make: string; model: string; year: number; location: string }
      | null;
    const name = (staff as { full_name?: string | null } | null)?.full_name ?? 'there';
    await sendEmail({
      to: email,
      subject: v
        ? `New inspection assigned — ${v.inspection_id} (${v.reg_number})`
        : 'New inspection assigned',
      text: [
        `Hi ${name},`,
        '',
        v
          ? `A car has been assigned to you for inspection:`
          : `A car has been assigned to you for inspection:`,
        v
          ? [
              `File: ${v.inspection_id}`,
              `Car: ${v.year} ${v.make} ${v.model}`,
              `Registration: ${v.reg_number}`,
              `Location: ${v.location}`,
            ].join('\n')
          : `Vehicle file updated.`,
        '',
        `Open your workspace: ${SITE_URL}/staff`,
        '',
        `— AutoFair`,
      ].join('\n'),
    });
  } catch (err) {
    logDbError('notify.staffAssigned', err, { vehicleId });
  }
}
