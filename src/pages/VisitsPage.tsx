import { useEffect, useMemo, useState } from 'react';
import ConfirmModal from '../components/ConfirmModal';
import { useAuthz } from '../contexts/AuthzContext';
import { useToast } from '../contexts/ToastContext';
import type { ApiError } from '../lib/api';
import { apiRequest } from '../lib/api';
import { permissionCodes } from '../lib/permissions';
import { isValidEmail, isValidKenyanPhone, normalizeKenyanPhone } from '../lib/validation';

type VisitStatus = 'scheduled' | 'checked_in' | 'completed' | 'cancelled' | 'no_show';

type Resident = {
  id: string;
  firstName: string;
  lastName: string;
  residentNumber: string;
  isArchived: boolean;
};

type Visit = {
  id: string;
  residentId: string;
  visitorName: string;
  relationship: string | null;
  phoneNumber: string | null;
  email: string | null;
  scheduledAt: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  status: VisitStatus;
  notes: string | null;
};

const visitStatuses: VisitStatus[] = ['scheduled', 'checked_in', 'completed', 'cancelled', 'no_show'];

const VisitsPage = () => {
  const { can } = useAuthz();
  const { showToast } = useToast();

  const canRead = can(permissionCodes.visitsRead);
  const canCreate = can(permissionCodes.visitsCreate);
  const canUpdate = can(permissionCodes.visitsUpdate);
  const canDelete = can(permissionCodes.visitsDelete);

  const [residents, setResidents] = useState<Resident[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);

  const [residentFilter, setResidentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [form, setForm] = useState({
    residentId: '',
    visitorName: '',
    relationship: '',
    phoneNumber: '',
    email: '',
    scheduledAt: '',
    status: 'scheduled' as VisitStatus,
    notes: '',
  });

  const [editing, setEditing] = useState<Record<string, { status: VisitStatus }>>({});
  const [visitToDelete, setVisitToDelete] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const toApiError = (error: unknown) => error as ApiError;

  const residentLabelById = useMemo(
    () =>
      Object.fromEntries(
        residents.map((resident) => [resident.id, `${resident.firstName} ${resident.lastName}`]),
      ),
    [residents],
  );

  const loadResidents = async () => {
    if (!canRead && !canCreate) return;

    try {
      const response = await apiRequest<{ data: Resident[] }>('/api/admin/residents');
      setResidents(response.data);
      if (!form.residentId && response.data.length > 0) {
        setForm((state) => ({ ...state, residentId: response.data[0].id }));
      }
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    }
  };

  const loadVisits = async (options?: { ignoreFilters?: boolean }) => {
    if (!canRead) return;

    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (!options?.ignoreFilters) {
        if (residentFilter) query.set('residentId', residentFilter);
        if (statusFilter) query.set('status', statusFilter);
      }

      const response = await apiRequest<{ data: Visit[] }>(
        `/api/admin/visits${query.toString() ? `?${query.toString()}` : ''}`,
      );
      setVisits(response.data);
      setEditing(
        Object.fromEntries(response.data.map((visit) => [visit.id, { status: visit.status }])),
      );
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadResidents();
  }, [canRead, canCreate]);

  useEffect(() => {
    void loadVisits();
  }, [residentFilter, statusFilter, canRead]);

  const createVisit = async () => {
    if (!form.residentId || !form.visitorName.trim() || !form.scheduledAt) return;

    if (form.email.trim() && !isValidEmail(form.email)) {
      showToast('Enter a valid email address.', 'error');
      return;
    }

    if (form.phoneNumber.trim() && !isValidKenyanPhone(form.phoneNumber)) {
      showToast('Phone number must be a valid Kenyan number.', 'error');
      return;
    }

    setBusy(true);
    try {
      await apiRequest(`/api/admin/residents/${encodeURIComponent(form.residentId)}/visits`, {
        method: 'POST',
        body: JSON.stringify({
          visitorName: form.visitorName,
          relationship: form.relationship || undefined,
          phoneNumber: form.phoneNumber ? normalizeKenyanPhone(form.phoneNumber) : undefined,
          email: form.email || undefined,
          scheduledAt: new Date(form.scheduledAt).toISOString(),
          status: form.status,
          notes: form.notes || undefined,
        }),
      });

      setForm((state) => ({
        ...state,
        visitorName: '',
        relationship: '',
        phoneNumber: '',
        email: '',
        scheduledAt: '',
        status: 'scheduled',
        notes: '',
      }));
      setResidentFilter('');
      setStatusFilter('');
      showToast('Visit created.', 'success');
      await loadVisits({ ignoreFilters: true });
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const updateVisitStatus = async (visitId: string) => {
    const draft = editing[visitId];
    if (!draft) return;

    setBusy(true);
    try {
      await apiRequest(`/api/admin/visits/${encodeURIComponent(visitId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: draft.status }),
      });
      if (statusFilter) {
        setStatusFilter('');
      }
      showToast('Visit updated.', 'success');
      await loadVisits({ ignoreFilters: true });
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const markCheckInOut = async (visit: Visit, mode: 'checkin' | 'checkout') => {
    setBusy(true);
    try {
      await apiRequest(`/api/admin/visits/${encodeURIComponent(visit.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(
          mode === 'checkin'
            ? {
                status: 'checked_in',
                checkInAt: new Date().toISOString(),
              }
            : {
                status: 'completed',
                checkOutAt: new Date().toISOString(),
              },
        ),
      });
      if (statusFilter) {
        setStatusFilter('');
      }
      showToast(mode === 'checkin' ? 'Visitor checked in.' : 'Visitor checked out.', 'success');
      await loadVisits({ ignoreFilters: true });
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const deleteVisit = async () => {
    if (!visitToDelete) return;

    setBusy(true);
    try {
      await apiRequest(`/api/admin/visits/${encodeURIComponent(visitToDelete)}`, { method: 'DELETE' });
      showToast('Visit deleted.', 'success');
      setVisitToDelete(null);
      await loadVisits();
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!canRead) {
    return (
      <section>
        <h1 className="text-2xl font-semibold text-(--color-primary)">Visits</h1>
        <p className="mt-1 text-sm text-(--color-primary)/70">
          You do not have permission to view visits.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-(--color-primary)">Visits</h1>
        <p className="mt-1 text-sm text-(--color-primary)/70">
          Track visitor schedules, check-ins, and check-outs for residents.
        </p>
      </div>

      <div className="rounded-xl border border-(--color-primary)/20 bg-(--color-surface) p-4">
        <div className="grid gap-2 md:grid-cols-3">
          <select
            value={residentFilter}
            onChange={(event) => setResidentFilter(event.target.value)}
            className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
          >
            <option value="">All residents</option>
            {residents.map((resident) => (
              <option key={resident.id} value={resident.id}>
                {resident.firstName} {resident.lastName} ({resident.residentNumber})
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
          >
            <option value="">All statuses</option>
            {visitStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void loadVisits()}
            className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm text-(--color-primary) hover:bg-(--color-cream)"
          >
            Refresh
          </button>
        </div>
      </div>

      {canCreate ? (
        <div className="rounded-xl border border-(--color-primary)/20 bg-(--color-surface) p-4">
          <h2 className="text-sm font-semibold text-(--color-primary)">Schedule Visit</h2>
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            <select
              value={form.residentId}
              onChange={(event) => setForm((state) => ({ ...state, residentId: event.target.value }))}
              className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            >
              <option value="">Select resident</option>
              {residents.map((resident) => (
                <option key={resident.id} value={resident.id}>
                  {resident.firstName} {resident.lastName} ({resident.residentNumber})
                </option>
              ))}
            </select>
            <input
              placeholder="Visitor name"
              value={form.visitorName}
              onChange={(event) => setForm((state) => ({ ...state, visitorName: event.target.value }))}
              className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            />
            <input
              type="datetime-local"
              value={form.scheduledAt}
              onChange={(event) => setForm((state) => ({ ...state, scheduledAt: event.target.value }))}
              className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            />
            <input
              placeholder="Relationship"
              value={form.relationship}
              onChange={(event) => setForm((state) => ({ ...state, relationship: event.target.value }))}
              className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            />
            <input
              type="tel"
              placeholder="Phone"
              value={form.phoneNumber}
              onChange={(event) => setForm((state) => ({ ...state, phoneNumber: event.target.value }))}
              className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            />
            <input
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(event) => setForm((state) => ({ ...state, email: event.target.value }))}
              className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            />
            <select
              value={form.status}
              onChange={(event) =>
                setForm((state) => ({ ...state, status: event.target.value as VisitStatus }))
              }
              className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            >
              {visitStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <input
              placeholder="Notes"
              value={form.notes}
              onChange={(event) => setForm((state) => ({ ...state, notes: event.target.value }))}
              className="md:col-span-2 rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            />
          </div>
          <button
            type="button"
            onClick={() => void createVisit()}
            disabled={busy || !form.residentId || !form.visitorName.trim() || !form.scheduledAt}
            className="mt-3 rounded-md bg-(--color-primary) px-3.5 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Create visit
          </button>
        </div>
      ) : null}

      <div className="rounded-xl border border-(--color-primary)/20 bg-(--color-surface) p-4">
        {loading ? (
          <p className="text-sm text-(--color-primary)/70">Loading visits...</p>
        ) : visits.length === 0 ? (
          <p className="text-sm text-(--color-primary)/70">No visits found.</p>
        ) : (
          <div className="space-y-2">
            {visits.map((visit) => (
              <article
                key={visit.id}
                className="rounded-xl border border-(--color-primary)/15 bg-(--color-surface) p-4 shadow-sm"
              >
                <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-base font-semibold text-(--color-primary)">
                        {visit.visitorName}
                      </p>
                      <span className="rounded-full bg-(--color-cream) px-2 py-0.5 text-xs text-(--color-primary)/80">
                        {residentLabelById[visit.residentId] ?? 'Resident'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-(--color-primary)/70">
                      Scheduled: {new Date(visit.scheduledAt).toLocaleString()}
                    </p>
                    <p className="text-sm text-(--color-primary)/65">
                      Check-in: {visit.checkInAt ? new Date(visit.checkInAt).toLocaleString() : '-'} • Check-out:{' '}
                      {visit.checkOutAt ? new Date(visit.checkOutAt).toLocaleString() : '-'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={editing[visit.id]?.status ?? visit.status}
                      onChange={(event) =>
                        setEditing((state) => ({
                          ...state,
                          [visit.id]: { status: event.target.value as VisitStatus },
                        }))
                      }
                      disabled={!canUpdate}
                      className="w-full rounded-md border border-(--color-primary)/25 px-2.5 py-2 text-sm outline-none focus:border-(--color-primary) disabled:opacity-60"
                    >
                      {visitStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    {canUpdate ? (
                      <button
                        type="button"
                        onClick={() => void updateVisitStatus(visit.id)}
                        disabled={busy}
                        className="btn-edit px-3 py-2 disabled:opacity-50"
                      >
                        Save
                      </button>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    {canUpdate ? (
                      <button
                        type="button"
                        onClick={() => void markCheckInOut(visit, visit.checkInAt ? 'checkout' : 'checkin')}
                        disabled={busy || visit.status === 'cancelled' || visit.status === 'no_show'}
                        className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-xs font-medium text-(--color-primary) hover:bg-(--color-cream) disabled:opacity-50"
                      >
                        {visit.checkInAt ? 'Check out' : 'Check in'}
                      </button>
                    ) : null}
                    {canDelete ? (
                      <button
                        type="button"
                        onClick={() => setVisitToDelete(visit.id)}
                        className="btn-delete px-3 py-2"
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!visitToDelete}
        title="Delete Visit"
        description="This visit record will be permanently removed. Continue?"
        confirmLabel="Delete"
        destructive
        loading={busy}
        onCancel={() => setVisitToDelete(null)}
        onConfirm={() => {
          void deleteVisit();
        }}
      />
    </section>
  );
};

export default VisitsPage;
