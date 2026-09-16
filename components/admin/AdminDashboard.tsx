'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Container } from '@/components/shared/Container';
import { getSafeErrorMessage } from '@/lib/errors/db-error';
import {
  createAdminInspection,
  createAdminStaff,
  fetchAdminInspections,
  fetchAdminOverview,
  fetchAdminStaff,
  fetchAuditLog,
  manualOverride,
  runAutoAssign,
  updateAdminStaff,
  updateInspectionStatus,
  type AdminInspection,
  type AdminStaff,
  type AuditEntry,
  type OverviewData,
} from '@/lib/supabase/admin';

const STATUS_STYLES: Record<string, string> = {
  Pending: 'bg-[#FFF4DD] text-[#8A5A00] border border-[#F4B740]/60',
  Assigned: 'bg-[#E6F4F1] text-[#0E8A7D] border border-[#BFE9E2]',
  'In Progress': 'bg-[#E8EEF6] text-[#1B3350] border border-[#9FB2C5]/60',
  Completed: 'bg-[#E9F7EF] text-[#1E7A34] border border-[#A9DFBF]',
  Cancelled: 'bg-[#FDECEC] text-[#9B2C2C] border border-[#E85D5D]/40',
};

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
  } catch {
    return iso;
  }
}

function formatDateFull(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  } catch {
    return iso;
  }
}

function Modal({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/60 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="w-full max-w-[520px] border border-line bg-white p-6 shadow-[0_20px_60px_rgba(11,23,38,0.3)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-sans text-[18px] font-extrabold text-navy">{title}</h3>
            {sub && <p className="mt-1 font-sans text-[13px] text-muted">{sub}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="border border-line px-3 py-1.5 font-mono text-[12px] text-muted hover:border-navy hover:text-navy">
            ✕
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

const inputCls = 'w-full border border-line bg-off-white px-4 py-3 font-sans text-[14px] text-navy outline-none placeholder:text-[#9AA8B5] focus:border-teal';

export function AdminDashboard() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [staff, setStaff] = useState<AdminStaff[] | null>(null);
  const [inspections, setInspections] = useState<AdminInspection[] | null>(null);
  const [logs, setLogs] = useState<AuditEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const [showAddStaff, setShowAddStaff] = useState(false);
  const [addName, setAddName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addPw, setAddPw] = useState('');
  const [addErr, setAddErr] = useState<string | null>(null);

  const [editing, setEditing] = useState<AdminStaff | null>(null);
  const [editName, setEditName] = useState('');
  const [editErr, setEditErr] = useState<string | null>(null);

  const [deactivating, setDeactivating] = useState<AdminStaff | null>(null);

  const [showNewInsp, setShowNewInsp] = useState(false);
  const [nReg, setNReg] = useState('');
  const [nMake, setNMake] = useState('');
  const [nModel, setNModel] = useState('');
  const [nVariant, setNVariant] = useState('');
  const [nYear, setNYear] = useState(String(new Date().getFullYear()));
  const [nLoc, setNLoc] = useState('');
  const [nWhen, setNWhen] = useState('');
  const [newErr, setNewErr] = useState<string | null>(null);

  const [overriding, setOverriding] = useState<AdminInspection | null>(null);
  const [ovStaff, setOvStaff] = useState('');
  const [ovReason, setOvReason] = useState('');
  const [ovErr, setOvErr] = useState<string | null>(null);

  const refresh = useCallback(async (withSpinner = false) => {
    if (withSpinner) setLoading(true);
    setPageError(null);
    try {
      const [ov, st, insp, lg] = await Promise.all([
        fetchAdminOverview(),
        fetchAdminStaff(),
        fetchAdminInspections(),
        fetchAuditLog(),
      ]);
      setOverview(ov);
      setStaff(st);
      setInspections(insp);
      setLogs(lg);
    } catch (err) {
      setPageError(getSafeErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  const filteredInspections = useMemo(() => {
    if (!inspections) return null;
    return inspections.filter((v) => {
      if (statusFilter && v.inspectionStatus !== statusFilter) return false;
      if (search) {
        const hay = `${v.regNumber} ${v.vehicle} ${v.location} ${v.inspectionCode}`.toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [inspections, statusFilter, search]);

  const maxLoad = useMemo(() => Math.max(1, ...(overview?.workload.map((w) => w.load) ?? [1])), [overview]);

  async function handleCreateStaff() {
    setAddErr(null);
    setNotice(null);
    if (!addName.trim() || addName.trim().length < 2) {
      setAddErr('Enter the staff member’s full name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addEmail.trim())) {
      setAddErr('Enter a valid email address.');
      return;
    }
    if (!addPw || addPw.length < 6) {
      setAddErr('Password must be at least 6 characters. It is hashed on the server and never shown again.');
      return;
    }
    setBusy('add-staff');
    try {
      await createAdminStaff({ fullName: addName.trim(), email: addEmail.trim(), password: addPw });
      setShowAddStaff(false);
      setAddName('');
      setAddEmail('');
      setAddPw('');
      setNotice(`Staff account created for ${addEmail.trim()}. Password is securely hashed and cannot be viewed again.`);
      await refresh();
    } catch (err) {
      setAddErr(getSafeErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleEditStaff() {
    if (!editing) return;
    setEditErr(null);
    setBusy('edit-staff');
    try {
      const res = await updateAdminStaff(editing.id, { fullName: editName.trim() });
      setEditing(null);
      setNotice(`Updated ${res.fullName}.`);
      await refresh();
    } catch (err) {
      setEditErr(getSafeErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleActive(s: AdminStaff) {
    if (s.isActive) {
      setDeactivating(s);
      return;
    }
    setBusy(`toggle-${s.id}`);
    try {
      await updateAdminStaff(s.id, { isActive: true });
      setNotice(`${s.fullName} reactivated. New inspections can auto-assign to them again.`);
      await refresh();
    } catch (err) {
      setPageError(getSafeErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function confirmDeactivate() {
    if (!deactivating) return;
    setBusy(`toggle-${deactivating.id}`);
    try {
      const res = await updateAdminStaff(deactivating.id, { isActive: false });
      setDeactivating(null);
      setNotice(
        res.reassigned > 0
          ? `${res.fullName} deactivated. ${res.reassigned} upcoming inspection${res.reassigned === 1 ? '' : 's'} automatically reassigned by workload. See audit log.`
          : `${res.fullName} deactivated. They had no active inspections to reassign.`
      );
      await refresh();
    } catch (err) {
      setPageError(getSafeErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleRunAssign() {
    setBusy('run-assign');
    setNotice(null);
    try {
      const res = await runAutoAssign();
      setNotice(
        res.scanned === 0
          ? 'Nothing to assign — every upcoming inspection already has staff.'
          : res.assigned > 0
            ? `Auto-assignment complete: ${res.assigned} of ${res.scanned} unassigned inspection${res.scanned === 1 ? '' : 's'} assigned by lowest workload.`
            : 'No active staff available. Activate at least one staff member, then run auto-assign again.'
      );
      await refresh();
    } catch (err) {
      setPageError(getSafeErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleCreateInspection() {
    setNewErr(null);
    const year = Number(nYear);
    if (!nReg.trim()) {
      setNewErr('Enter the registration number.');
      return;
    }
    if (!nMake.trim() || !nModel.trim()) {
      setNewErr('Enter the vehicle make and model.');
      return;
    }
    if (!Number.isFinite(year) || year < 2000 || year > 2030) {
      setNewErr('Enter a valid model year (2000–2030).');
      return;
    }
    if (!nLoc.trim()) {
      setNewErr('Enter the inspection location.');
      return;
    }
    setBusy('new-insp');
    try {
      const res = await createAdminInspection({
        regNumber: nReg.trim(),
        make: nMake.trim(),
        model: nModel.trim(),
        variant: nVariant.trim(),
        year,
        location: nLoc.trim(),
        scheduledAt: nWhen ? new Date(nWhen).toISOString() : new Date().toISOString(),
      });
      setShowNewInsp(false);
      setNReg('');
      setNMake('');
      setNModel('');
      setNVariant('');
      setNLoc('');
      setNWhen('');
      setNotice(res.message);
      await refresh();
    } catch (err) {
      setNewErr(getSafeErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleOverride() {
    if (!overriding) return;
    setOvErr(null);
    if (!ovStaff) {
      setOvErr('Choose a staff member.');
      return;
    }
    if (!ovReason.trim()) {
      setOvErr('Enter a reason. It is saved in the audit log.');
      return;
    }
    setBusy('override');
    try {
      await manualOverride({ vehicleId: overriding.vehicleId, staffId: ovStaff, reason: ovReason.trim() });
      setOverriding(null);
      setOvStaff('');
      setOvReason('');
      setNotice(`Manual override saved for ${overriding.regNumber}. Logged as Manual Override.`);
      await refresh();
    } catch (err) {
      setOvErr(getSafeErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleApplyFilter() {
    setPageError(null);
    try {
      setInspections(await fetchAdminInspections(statusFilter, search));
    } catch (err) {
      setPageError(getSafeErrorMessage(err));
    }
  }

  async function handleStatusChange(insp: AdminInspection, next: string) {
    if (next === insp.inspectionStatus) return;
    if (next === 'Cancelled' && !window.confirm(`Cancel inspection ${insp.regNumber}? The vehicle leaves the active workload.`)) return;
    setBusy(`status-${insp.vehicleId}`);
    try {
      await updateInspectionStatus(insp.vehicleId, { inspectionStatus: next });
      setNotice(`${insp.regNumber} moved to ${next}. Workload updated automatically.`);
      await refresh();
    } catch (err) {
      setPageError(getSafeErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const totals = overview?.totals;
  const activeStaffList = (staff ?? []).filter((s) => s.isActive);

  return (
    <Container className="pb-16 pt-12">
      <p className="font-mono text-[11px] tracking-[0.06em] text-teal-dark">ADMIN&nbsp;&nbsp;•&nbsp;&nbsp;INSPECTION MANAGEMENT</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-sans text-[32px] font-extrabold text-navy">Admin dashboard.</h1>
          <p className="mt-2 max-w-[680px] font-sans text-[14px] leading-relaxed text-muted">
            Manage staff, monitor workload and monitor inspections. The system automatically distributes upcoming
            inspections by lowest workload — you monitor the result and override only in exceptional cases.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="border border-navy/30 px-5 py-2.5 font-sans text-[13px] font-bold text-navy hover:border-navy disabled:opacity-60"
        >
          {loading ? 'Refreshing…' : 'Refresh ↻'}
        </button>
      </div>

      <div className="mt-4 border border-teal-line bg-teal-bg px-4 py-3">
        <p className="font-mono text-[10px] tracking-[0.06em] text-teal-dark">AUTOMATION&nbsp;&nbsp;•&nbsp;&nbsp;NEW INSPECTION → CHECK ACTIVE STAFF → LOWEST WORKLOAD → ASSIGN → UPDATE LOAD</p>
        <p className="mt-1 font-sans text-[13px] text-teal-dark">
          Workload is calculated on the backend on every assignment. Equal loads break ties by inspections assigned today, then earliest last assignment — never by frontend values.
        </p>
      </div>

      {pageError && (
        <p role="alert" className="mt-4 border border-coral/50 bg-[#FDECEC] px-4 py-3 font-sans text-[13px] font-semibold text-[#9B2C2C]">
          {pageError}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-4 border border-teal-line bg-teal-bg px-4 py-3 font-sans text-[13px] font-semibold text-teal-dark">
          {notice}
        </p>
      )}

      {loading && !overview ? (
        <p className="mt-8 font-mono text-[11px] text-muted" role="status">LOADING DASHBOARD…</p>
      ) : (
        <>
          {/* Summary cards */}
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {[
              { label: 'Total Staff', value: totals?.totalStaff ?? 0 },
              { label: 'Active Staff', value: totals?.activeStaff ?? 0 },
              { label: 'Upcoming Inspections', value: totals?.upcoming ?? 0 },
              { label: 'Unassigned', value: totals?.unassigned ?? 0, alert: (totals?.unassigned ?? 0) > 0 },
              { label: 'In Progress', value: totals?.inProgress ?? 0 },
              { label: 'Completed', value: totals?.completed ?? 0 },
            ].map((c) => (
              <div key={c.label} className={`border bg-white p-4 ${c.alert ? 'border-amber' : 'border-line'}`}>
                <p className="font-mono text-[10px] tracking-[0.06em] text-muted">{c.label.toUpperCase()}</p>
                <p className="mt-1 font-sans text-[28px] font-extrabold text-navy">{c.value}</p>
              </div>
            ))}
          </div>

          {/* Workload */}
          <section className="mt-6 border border-line bg-white p-6" aria-label="Staff workload">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-sans text-[18px] font-extrabold text-navy">Staff workload</h2>
                <p className="mt-1 font-sans text-[13px] text-muted">Active inspections per staff member. Calculated live on the backend.</p>
              </div>
              {(totals?.unassigned ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={handleRunAssign}
                  disabled={busy === 'run-assign'}
                  className="bg-navy px-5 py-2.5 font-sans text-[13px] font-bold text-white hover:bg-navy-2 disabled:opacity-60"
                >
                  {busy === 'run-assign' ? 'Assigning…' : `Run auto-assign (${totals?.unassigned}) →`}
                </button>
              )}
            </div>
            {!overview || overview.workload.length === 0 ? (
              <div className="mt-4 border border-dashed border-line bg-off-white p-6 text-center">
                <p className="font-mono text-[11px] text-teal-dark">NO STAFF YET</p>
                <p className="mt-2 font-sans text-[14px] font-bold text-navy">Add your first inspection staff member to enable auto-assignment.</p>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {overview.workload.map((w) => (
                  <div key={w.staffId} className="flex items-center gap-3">
                    <div className="w-[160px] shrink-0 truncate font-sans text-[13px] font-bold text-navy" title={w.email ?? ''}>
                      {w.fullName}
                      {!w.isActive && <span className="ml-2 font-mono text-[10px] font-normal text-[#9B2C2C]">INACTIVE</span>}
                    </div>
                    <div className="h-[14px] flex-1 bg-off-white" role="img" aria-label={`${w.fullName} has ${w.load} inspections`}>
                      <div className="h-full bg-teal" style={{ width: `${Math.round((w.load / maxLoad) * 100)}%`, minWidth: w.load > 0 ? 8 : 0 }} />
                    </div>
                    <div className="w-[90px] shrink-0 text-right font-mono text-[12px] text-navy">{w.load} insp.</div>
                    <div className="hidden w-[90px] shrink-0 text-right font-mono text-[11px] text-muted sm:block">today {w.today}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Upcoming inspections */}
          <section className="mt-6 border border-line bg-white p-6" aria-label="Upcoming inspections">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-sans text-[18px] font-extrabold text-navy">Upcoming inspections</h2>
                <p className="mt-1 font-sans text-[13px] text-muted">Vehicles needing inspection. Assignment is automatic — use Override only for exceptions.</p>
              </div>
              <button
                type="button"
                onClick={() => { setShowNewInsp(true); setNewErr(null); }}
                className="bg-navy px-5 py-2.5 font-sans text-[13px] font-bold text-white hover:bg-navy-2"
              >
                + New inspection
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search reg, vehicle, location, ID…"
                className={`${inputCls} sm:max-w-[320px]`}
                aria-label="Search inspections"
              />
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-line bg-white px-4 py-3 font-sans text-[14px] outline-none focus:border-teal sm:max-w-[220px]" aria-label="Filter by status">
                <option value="">All statuses</option>
                {['Pending', 'Assigned', 'In Progress', 'Completed', 'Cancelled'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void handleApplyFilter()}
                className="border border-navy/30 px-5 py-3 font-sans text-[13px] font-bold text-navy hover:border-navy"
              >
                Apply
              </button>
            </div>

            {!filteredInspections ? (
              <p className="mt-4 font-mono text-[11px] text-muted" role="status">LOADING INSPECTIONS…</p>
            ) : filteredInspections.length === 0 ? (
              <div className="mt-4 border border-dashed border-line bg-off-white p-6 text-center">
                <p className="font-mono text-[11px] text-teal-dark">NO INSPECTIONS</p>
                <p className="mt-2 font-sans text-[14px] font-bold text-navy">No vehicles match this filter.</p>
                <p className="mt-1 font-sans text-[13px] text-muted">Create a new inspection to see auto-assignment in action.</p>
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[860px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line font-mono text-[10px] tracking-[0.06em] text-muted">
                      <th className="py-2 pr-4">INSPECTION</th>
                      <th className="py-2 pr-4">VEHICLE</th>
                      <th className="py-2 pr-4">LOCATION</th>
                      <th className="py-2 pr-4">SCHEDULED</th>
                      <th className="py-2 pr-4">ASSIGNED STAFF</th>
                      <th className="py-2 pr-4">STATUS</th>
                      <th className="py-2">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInspections.map((v) => (
                      <tr key={v.vehicleId} className="border-b border-line/60 font-sans text-[13px]">
                        <td className="py-3 pr-4">
                          <p className="font-bold text-navy">{v.regNumber}</p>
                          <p className="font-mono text-[11px] text-muted">{v.inspectionCode}</p>
                        </td>
                        <td className="py-3 pr-4">
                          <p className="font-semibold text-navy">{v.vehicle}</p>
                          <p className="font-mono text-[11px] text-muted">{v.fuel} • {v.transmission}</p>
                        </td>
                        <td className="py-3 pr-4 text-navy">{v.location}</td>
                        <td className="py-3 pr-4 font-mono text-[12px] text-navy">{formatDateTime(v.scheduledAt)}</td>
                        <td className="py-3 pr-4">
                          {v.assignedStaff ? (
                            <>
                              <p className="font-semibold text-navy">{v.assignedStaff.fullName}</p>
                              <p className="font-mono text-[11px] text-muted">{v.assignedStaff.email ?? ''}</p>
                            </>
                          ) : (
                            <span className="inline-block bg-[#FFF4DD] px-2 py-1 font-mono text-[11px] text-[#8A5A00]">UNASSIGNED</span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`inline-block px-2 py-1 font-mono text-[11px] ${STATUS_STYLES[v.inspectionStatus] ?? 'border border-line'}`}>
                            {v.inspectionStatus.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              value={v.inspectionStatus}
                              disabled={busy === `status-${v.vehicleId}`}
                              onChange={(e) => void handleStatusChange(v, e.target.value)}
                              className="border border-line bg-white px-2 py-1.5 font-sans text-[12px] outline-none focus:border-teal"
                              aria-label={`Update status for ${v.regNumber}`}
                            >
                              {['Pending', 'Assigned', 'In Progress', 'Completed', 'Cancelled'].map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => { setOverriding(v); setOvStaff(''); setOvReason(''); setOvErr(null); }}
                              className="border border-navy/30 px-3 py-1.5 font-sans text-[12px] font-bold text-navy hover:border-navy"
                            >
                              Override
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Staff management */}
          <section className="mt-6 border border-line bg-white p-6" aria-label="Staff management">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-sans text-[18px] font-extrabold text-navy">Staff management</h2>
                <p className="mt-1 font-sans text-[13px] text-muted">Add staff, edit details, activate or deactivate. Passwords are hashed and never displayed.</p>
              </div>
              <button
                type="button"
                onClick={() => { setShowAddStaff(true); setAddErr(null); }}
                className="bg-navy px-5 py-2.5 font-sans text-[13px] font-bold text-white hover:bg-navy-2"
              >
                + Add staff
              </button>
            </div>

            {!staff ? (
              <p className="mt-4 font-mono text-[11px] text-muted" role="status">LOADING STAFF…</p>
            ) : staff.length === 0 ? (
              <div className="mt-4 border border-dashed border-line bg-off-white p-6 text-center">
                <p className="font-mono text-[11px] text-teal-dark">NO STAFF</p>
                <p className="mt-2 font-sans text-[14px] font-bold text-navy">No inspection staff registered yet.</p>
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line font-mono text-[10px] tracking-[0.06em] text-muted">
                      <th className="py-2 pr-4">STAFF</th>
                      <th className="py-2 pr-4">EMAIL</th>
                      <th className="py-2 pr-4 text-right">CURRENT LOAD</th>
                      <th className="py-2 pr-4 text-right">UPCOMING</th>
                      <th className="py-2 pr-4">STATUS</th>
                      <th className="py-2">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map((s) => (
                      <tr key={s.id} className="border-b border-line/60 font-sans text-[13px]">
                        <td className="py-3 pr-4">
                          <p className="font-bold text-navy">{s.fullName}</p>
                          <p className="font-mono text-[11px] text-muted">today {s.todayCount} • last {formatDateTime(s.lastAssignmentAt)}</p>
                        </td>
                        <td className="py-3 pr-4 text-navy">{s.email ?? '—'}</td>
                        <td className="py-3 pr-4 text-right font-mono text-[13px] font-bold text-navy">{s.load}</td>
                        <td className="py-3 pr-4 text-right font-mono text-[13px] text-navy">{s.upcomingCount}</td>
                        <td className="py-3 pr-4">
                          <span className={`inline-block px-2 py-1 font-mono text-[11px] ${s.isActive ? 'bg-[#E9F7EF] text-[#1E7A34] border border-[#A9DFBF]' : 'bg-[#FDECEC] text-[#9B2C2C] border border-[#E85D5D]/40'}`}>
                            {s.isActive ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                        </td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => { setEditing(s); setEditName(s.fullName); setEditErr(null); }}
                              className="border border-navy/30 px-3 py-1.5 font-sans text-[12px] font-bold text-navy hover:border-navy"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={busy === `toggle-${s.id}`}
                              onClick={() => void handleToggleActive(s)}
                              className={`px-3 py-1.5 font-sans text-[12px] font-bold ${s.isActive ? 'border border-coral/60 text-[#9B2C2C] hover:border-coral' : 'bg-navy text-white hover:bg-navy-2'} disabled:opacity-60`}
                            >
                              {busy === `toggle-${s.id}` ? '…' : s.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Audit log */}
          <section className="mt-6 border border-line bg-white p-6" aria-label="Assignment history">
            <h2 className="font-sans text-[18px] font-extrabold text-navy">Assignment history</h2>
            <p className="mt-1 font-sans text-[13px] text-muted">Every automatic assignment and manual override, with reason and timestamp.</p>
            {!logs ? (
              <p className="mt-4 font-mono text-[11px] text-muted" role="status">LOADING HISTORY…</p>
            ) : logs.length === 0 ? (
              <div className="mt-4 border border-dashed border-line bg-off-white p-6 text-center">
                <p className="font-mono text-[11px] text-teal-dark">NO ASSIGNMENTS YET</p>
                <p className="mt-2 font-sans text-[14px] font-bold text-navy">History appears here once inspections are assigned.</p>
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line font-mono text-[10px] tracking-[0.06em] text-muted">
                      <th className="py-2 pr-4">INSPECTION</th>
                      <th className="py-2 pr-4">CHANGE</th>
                      <th className="py-2 pr-4">TYPE</th>
                      <th className="py-2 pr-4">REASON</th>
                      <th className="py-2">TIME</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((l) => (
                      <tr key={l.id} className="border-b border-line/60 font-sans text-[13px]">
                        <td className="py-3 pr-4">
                          <p className="font-bold text-navy">{l.regNumber}</p>
                          <p className="font-mono text-[11px] text-muted">{l.inspectionCode} • {l.vehicleLabel}</p>
                        </td>
                        <td className="py-3 pr-4 text-navy">
                          {l.previousStaff ? l.previousStaff.name : 'Unassigned'} → {l.newStaff ? l.newStaff.name : 'Unassigned'}
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`inline-block px-2 py-1 font-mono text-[11px] ${l.assignmentType === 'Automatic' ? 'bg-[#E6F4F1] text-[#0E8A7D] border border-[#BFE9E2]' : 'bg-[#FFF4DD] text-[#8A5A00] border border-[#F4B740]/60'}`}>
                            {l.assignmentType.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-muted">{l.reason || '—'}</td>
                        <td className="py-3 font-mono text-[12px] text-navy">{formatDateFull(l.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {showAddStaff && (
        <Modal title="Add inspection staff" sub="They sign in with this email and password. Password is hashed on the server and never shown again." onClose={() => setShowAddStaff(false)}>
          <div className="space-y-4">
            <label className="block">
              <span className="font-mono text-[10px] text-muted">FULL NAME *</span>
              <input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="e.g. Priya Sharma" className={`${inputCls} mt-1.5`} />
            </label>
            <label className="block">
              <span className="font-mono text-[10px] text-muted">EMAIL ID *</span>
              <input value={addEmail} onChange={(e) => setAddEmail(e.target.value)} type="email" placeholder="staff@example.com" className={`${inputCls} mt-1.5`} />
            </label>
            <label className="block">
              <span className="font-mono text-[10px] text-muted">PASSWORD (MIN 6 CHARS) *</span>
              <input value={addPw} onChange={(e) => setAddPw(e.target.value)} type="password" autoComplete="new-password" placeholder="Set an initial password" className={`${inputCls} mt-1.5`} />
            </label>
            {addErr && <p role="alert" className="border border-coral/50 bg-[#FDECEC] px-4 py-3 font-sans text-[13px] font-semibold text-[#9B2C2C]">{addErr}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowAddStaff(false)} className="flex-1 border border-navy/30 px-4 py-3 font-sans text-[14px] font-bold text-navy hover:border-navy">Cancel</button>
              <button type="button" disabled={busy === 'add-staff'} onClick={handleCreateStaff} className="flex-1 bg-navy px-4 py-3 font-sans text-[14px] font-bold text-white hover:bg-navy-2 disabled:opacity-60">
                {busy === 'add-staff' ? 'Creating…' : 'Create account'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title={`Edit ${editing.fullName}`} sub="Only name is editable here. Email and password stay private to the staff member." onClose={() => setEditing(null)}>
          <div className="space-y-4">
            <label className="block">
              <span className="font-mono text-[10px] text-muted">FULL NAME *</span>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} className={`${inputCls} mt-1.5`} />
            </label>
            {editErr && <p role="alert" className="border border-coral/50 bg-[#FDECEC] px-4 py-3 font-sans text-[13px] font-semibold text-[#9B2C2C]">{editErr}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={() => setEditing(null)} className="flex-1 border border-navy/30 px-4 py-3 font-sans text-[14px] font-bold text-navy hover:border-navy">Cancel</button>
              <button type="button" disabled={busy === 'edit-staff'} onClick={handleEditStaff} className="flex-1 bg-navy px-4 py-3 font-sans text-[14px] font-bold text-white hover:bg-navy-2 disabled:opacity-60">
                {busy === 'edit-staff' ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deactivating && (
        <Modal title={`Deactivate ${deactivating.fullName}?`} sub="Their upcoming inspections will be automatically reassigned by workload. This is logged as Automatic." onClose={() => setDeactivating(null)}>
          <p className="font-sans text-[14px] text-navy">Current load: <strong>{deactivating.load} active inspection{deactivating.load === 1 ? '' : 's'}</strong>. Deactivation runs the assignment algorithm again for each one.</p>
          <div className="mt-4 flex gap-3">
            <button type="button" onClick={() => setDeactivating(null)} className="flex-1 border border-navy/30 px-4 py-3 font-sans text-[14px] font-bold text-navy hover:border-navy">Keep active</button>
            <button type="button" disabled={busy === `toggle-${deactivating.id}`} onClick={confirmDeactivate} className="flex-1 bg-[#9B2C2C] px-4 py-3 font-sans text-[14px] font-bold text-white hover:opacity-90 disabled:opacity-60">
              {busy === `toggle-${deactivating.id}` ? 'Reassigning…' : 'Deactivate + reassign'}
            </button>
          </div>
        </Modal>
      )}

      {showNewInsp && (
        <Modal title="New inspection" sub="Provide vehicle details only. The system auto-assigns staff by lowest workload — no manual picking." onClose={() => setShowNewInsp(false)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="font-mono text-[10px] text-muted">REG NUMBER *</span>
              <input value={nReg} onChange={(e) => setNReg(e.target.value)} placeholder="KA-05-MN-4218" className={`${inputCls} mt-1.5`} />
            </label>
            <label className="block">
              <span className="font-mono text-[10px] text-muted">LOCATION *</span>
              <input value={nLoc} onChange={(e) => setNLoc(e.target.value)} placeholder="Bangalore" className={`${inputCls} mt-1.5`} />
            </label>
            <label className="block">
              <span className="font-mono text-[10px] text-muted">MAKE *</span>
              <input value={nMake} onChange={(e) => setNMake(e.target.value)} placeholder="Hyundai" className={`${inputCls} mt-1.5`} />
            </label>
            <label className="block">
              <span className="font-mono text-[10px] text-muted">MODEL *</span>
              <input value={nModel} onChange={(e) => setNModel(e.target.value)} placeholder="Creta" className={`${inputCls} mt-1.5`} />
            </label>
            <label className="block">
              <span className="font-mono text-[10px] text-muted">VARIANT</span>
              <input value={nVariant} onChange={(e) => setNVariant(e.target.value)} placeholder="SX (optional)" className={`${inputCls} mt-1.5`} />
            </label>
            <label className="block">
              <span className="font-mono text-[10px] text-muted">YEAR *</span>
              <input value={nYear} onChange={(e) => setNYear(e.target.value)} inputMode="numeric" className={`${inputCls} mt-1.5`} />
            </label>
            <label className="block sm:col-span-2">
              <span className="font-mono text-[10px] text-muted">SCHEDULED DATE / TIME</span>
              <input value={nWhen} onChange={(e) => setNWhen(e.target.value)} type="datetime-local" className={`${inputCls} mt-1.5`} />
            </label>
          </div>
          {newErr && <p role="alert" className="mt-4 border border-coral/50 bg-[#FDECEC] px-4 py-3 font-sans text-[13px] font-semibold text-[#9B2C2C]">{newErr}</p>}
          <div className="mt-4 flex gap-3">
            <button type="button" onClick={() => setShowNewInsp(false)} className="flex-1 border border-navy/30 px-4 py-3 font-sans text-[14px] font-bold text-navy hover:border-navy">Cancel</button>
            <button type="button" disabled={busy === 'new-insp'} onClick={handleCreateInspection} className="flex-1 bg-navy px-4 py-3 font-sans text-[14px] font-bold text-white hover:bg-navy-2 disabled:opacity-60">
              {busy === 'new-insp' ? 'Creating…' : 'Create + auto-assign'}
            </button>
          </div>
        </Modal>
      )}

      {overriding && (
        <Modal title={`Manual override — ${overriding.regNumber}`} sub="Exceptional cases only. A reason is required and the normal automatic flow stays default." onClose={() => setOverriding(null)}>
          <div className="space-y-4">
            <label className="block">
              <span className="font-mono text-[10px] text-muted">ASSIGN TO (ACTIVE STAFF ONLY) *</span>
              <select value={ovStaff} onChange={(e) => setOvStaff(e.target.value)} className="mt-1.5 w-full border border-line bg-white px-4 py-3 font-sans text-[14px] outline-none focus:border-teal">
                <option value="">Choose staff…</option>
                {activeStaffList.map((s) => (
                  <option key={s.id} value={s.id}>{s.fullName} — {s.load} active</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="font-mono text-[10px] text-muted">REASON *</span>
              <textarea value={ovReason} onChange={(e) => setOvReason(e.target.value)} rows={3} placeholder="e.g. Customer requested Hindi-speaking inspector in Whitefield" className={`${inputCls} mt-1.5`} />
            </label>
            {ovErr && <p role="alert" className="border border-coral/50 bg-[#FDECEC] px-4 py-3 font-sans text-[13px] font-semibold text-[#9B2C2C]">{ovErr}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={() => setOverriding(null)} className="flex-1 border border-navy/30 px-4 py-3 font-sans text-[14px] font-bold text-navy hover:border-navy">Cancel</button>
              <button type="button" disabled={busy === 'override'} onClick={handleOverride} className="flex-1 bg-navy px-4 py-3 font-sans text-[14px] font-bold text-white hover:bg-navy-2 disabled:opacity-60">
                {busy === 'override' ? 'Saving…' : 'Save override'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Container>
  );
}
