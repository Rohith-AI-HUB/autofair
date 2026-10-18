import type { SupabaseClient } from '@supabase/supabase-js';

const OVERALL = new Set(['pass', 'attention', 'fail']);
const CONDITION_LABELS = new Set(['EXCELLENT', 'VERY GOOD', 'GOOD', 'AVERAGE', 'POOR']);
const ACCIDENTS = new Set(['CLEAR', 'MINOR REPAIR', 'MAJOR ACCIDENT']);

export interface SectionDraft {
  title: string;
  items: { name: string; result: string; note: string }[];
}

export interface VerificationDraft {
  score: number;
  overallStatus: 'pass' | 'attention' | 'fail';
  notes: string;
  ratings: Record<string, number | null> | null;
  condition: Record<string, string> | null;
  accidentStatus: string;
  accidentNote: string;
  docsStatus: string;
  docsNote: string;
  sections: SectionDraft[];
}

/**
 * Normalise an incoming verification body. Returns null when a required field
 * is missing or out of range — callers answer 422. Shared by first verification
 * and post-publish edits so the two can never drift apart.
 */
export function parseVerificationDraft(body: unknown): VerificationDraft | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;

  const score = typeof b.score === 'number' ? b.score : NaN;
  const overallStatus = typeof b.overallStatus === 'string' ? b.overallStatus : '';
  const notes = typeof b.notes === 'string' ? b.notes.slice(0, 2000) : '';
  if (!Number.isFinite(score) || score < 0 || score > 10) return null;
  if (!OVERALL.has(overallStatus)) return null;

  const ratings =
    b.ratings && typeof b.ratings === 'object' && !Array.isArray(b.ratings)
      ? (b.ratings as Record<string, unknown>)
      : null;
  const cleanRatings: Record<string, number | null> | null = (() => {
    if (!ratings) return null;
    const allowed = ['overall', 'exterior', 'interior', 'mechanical', 'tyres', 'electrical'];
    const out: Record<string, number | null> = {};
    for (const k of allowed) {
      const raw = ratings[k];
      if (raw == null) continue;
      const n = typeof raw === 'number' ? raw : Number(raw);
      out[k] = Number.isFinite(n) ? Math.min(10, Math.max(0, n)) : null;
    }
    return Object.keys(out).length ? out : null;
  })();

  const condition =
    b.condition && typeof b.condition === 'object' && !Array.isArray(b.condition)
      ? (b.condition as Record<string, unknown>)
      : null;
  const cleanCondition: Record<string, string> | null = (() => {
    if (!condition) return null;
    const out: Record<string, string> = {};
    for (const k of ['mechanical', 'exterior', 'interior', 'tyres']) {
      const raw = condition[k];
      if (typeof raw !== 'string' || !raw.trim()) continue;
      const v = raw.trim().toUpperCase().slice(0, 24);
      out[k] = CONDITION_LABELS.has(v) ? v : v;
    }
    return Object.keys(out).length ? out : null;
  })();

  const accidentStatusRaw =
    typeof b.accidentStatus === 'string' ? b.accidentStatus.trim().toUpperCase().slice(0, 32) : 'CLEAR';
  const accidentStatus = ACCIDENTS.has(accidentStatusRaw) ? accidentStatusRaw : 'CLEAR';
  const accidentNote = typeof b.accidentNote === 'string' ? b.accidentNote.slice(0, 500) : '';
  const docsStatus =
    typeof b.docsStatus === 'string' && b.docsStatus.trim()
      ? b.docsStatus.trim().toUpperCase().slice(0, 32)
      : '1 PENDING';
  const docsNote = typeof b.docsNote === 'string' ? b.docsNote.slice(0, 500) : '';

  // Breakdown sections: [{title, items:[{name,result,note}]}]. Capped so one
  // request cannot flood the table. Names/titles trimmed, notes sliced.
  const rawSections = Array.isArray(b.sections) ? (b.sections as unknown[]) : [];
  const sections = rawSections
    .slice(0, 12)
    .map((s) => {
      if (!s || typeof s !== 'object') return null;
      const title = typeof (s as { title?: unknown }).title === 'string'
        ? String((s as { title: string }).title).trim().slice(0, 80)
        : '';
      const rawItems = Array.isArray((s as { items?: unknown }).items)
        ? ((s as { items: unknown[] }).items as unknown[])
        : [];
      const items = rawItems
        .slice(0, 20)
        .map((it) => {
          if (!it || typeof it !== 'object') return null;
          const name = typeof (it as { name?: unknown }).name === 'string'
            ? String((it as { name: string }).name).trim().slice(0, 120)
            : '';
          const result = typeof (it as { result?: unknown }).result === 'string'
            ? String((it as { result: string }).result).toLowerCase()
            : '';
          const note = typeof (it as { note?: unknown }).note === 'string'
            ? String((it as { note: string }).note).slice(0, 300)
            : '';
          if (!name || !OVERALL.has(result)) return null;
          return { name, result, note };
        })
        .filter((x): x is { name: string; result: string; note: string } => x !== null);
      if (!title || !items.length) return null;
      return { title, items };
    })
    .filter((x): x is SectionDraft => x !== null);

  return {
    score,
    overallStatus: overallStatus as 'pass' | 'attention' | 'fail',
    notes,
    ratings: cleanRatings,
    condition: cleanCondition,
    accidentStatus,
    accidentNote,
    docsStatus,
    docsNote,
    sections,
  };
}

/**
 * Upsert the inspection row and replace its per-check breakdown. Deleting the
 * sections first means re-verification never duplicates rows; without sections
 * in the payload the report keeps its prior data.
 */
export async function writeVerification(
  sb: SupabaseClient,
  vehicleId: string,
  userId: string,
  draft: VerificationDraft
): Promise<void> {
  const payload = {
    inspector_id: userId,
    score: draft.score,
    overall_status: draft.overallStatus,
    notes: draft.notes,
    ratings: draft.ratings,
    condition: draft.condition,
    accident_status: draft.accidentStatus,
    accident_note: draft.accidentNote,
    docs_status: draft.docsStatus,
    docs_note: draft.docsNote,
    is_sample: false,
    inspected_at: new Date().toISOString(),
  };

  const { data: existingInsp } = await sb
    .from('inspections')
    .select('id')
    .eq('vehicle_id', vehicleId)
    .maybeSingle();

  if (existingInsp) {
    const { error } = await sb.from('inspections').update(payload).eq('vehicle_id', vehicleId);
    if (error) throw error;
  } else {
    const { error } = await sb
      .from('inspections')
      .insert({ vehicle_id: vehicleId, ...payload });
    if (error) throw error;
  }

  if (!draft.sections.length) return;

  const { data: inspRow } = await sb
    .from('inspections')
    .select('id')
    .eq('vehicle_id', vehicleId)
    .maybeSingle();
  const inspectionId = (inspRow as { id: string } | null)?.id;
  if (!inspectionId) throw new Error('inspection row missing after upsert');

  const { error: delErr } = await sb
    .from('inspection_sections')
    .delete()
    .eq('inspection_id', inspectionId);
  if (delErr) throw delErr;

  const now = new Date().toISOString();
  for (const sec of draft.sections) {
    const passed = sec.items.filter((i) => i.result === 'pass').length;
    const { data: secRow, error: sErr } = await sb
      .from('inspection_sections')
      .insert({ inspection_id: inspectionId, title: sec.title, passed, total: sec.items.length })
      .select('id')
      .single();
    if (sErr) throw sErr;
    const sectionId = (secRow as { id: string }).id;
    const { error: itErr } = await sb.from('inspection_items').insert(
      sec.items.map((it) => ({
        section_id: sectionId,
        name: it.name,
        result: it.result,
        note: it.note,
        inspected_at: now,
        inspector_id: userId,
      }))
    );
    if (itErr) throw itErr;
  }
}
