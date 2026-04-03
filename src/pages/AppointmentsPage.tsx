import { useEffect, useMemo, useState } from 'react';
import ConfirmModal from '../components/ConfirmModal';
import { useAuthz } from '../contexts/AuthzContext';
import { useToast } from '../contexts/ToastContext';
import type { ApiError } from '../lib/api';
import { apiRequest } from '../lib/api';
import { permissionCodes } from '../lib/permissions';

type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'missed';

type Resident = {
  id: string;
  firstName: string;
  lastName: string;
  residentNumber: string;
};

type Appointment = {
  id: string;
  residentId: string;
  title: string;
  appointmentType: string | null;
  providerName: string | null;
  location: string | null;
  scheduledAt: string;
  endsAt: string | null;
  status: AppointmentStatus;
  notes: string | null;
};

const appointmentStatuses: AppointmentStatus[] = ['scheduled', 'completed', 'cancelled', 'missed'];

const AppointmentsPage = () => {
  const { can } = useAuthz();
  const { showToast } = useToast();

  const canRead = can(permissionCodes.appointmentsRead);
  const canCreate = can(permissionCodes.appointmentsCreate);
  const canUpdate = can(permissionCodes.appointmentsUpdate);
  const canDelete = can(permissionCodes.appointmentsDelete);

  const [residents, setResidents] = useState<Resident[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  const [residentFilter, setResidentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [form, setForm] = useState({
    residentId: '',
    title: '',
    appointmentType: '',
    providerName: '',
    location: '',
    scheduledAt: '',
    endsAt: '',
    status: 'scheduled' as AppointmentStatus,
    notes: '',
  });

  const [editing, setEditing] = useState<Record<string, { status: AppointmentStatus }>>({});
  const [appointmentToDelete, setAppointmentToDelete] = useState<string | null>(null);

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

  const loadAppointments = async (options?: { ignoreFilters?: boolean }) => {
    if (!canRead) return;
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (!options?.ignoreFilters) {
        if (residentFilter) query.set('residentId', residentFilter);
        if (statusFilter) query.set('status', statusFilter);
      }

      const response = await apiRequest<{ data: Appointment[] }>(
        `/api/admin/appointments${query.toString() ? `?${query.toString()}` : ''}`,
      );
      setAppointments(response.data);
      setEditing(
        Object.fromEntries(
          response.data.map((appointment) => [appointment.id, { status: appointment.status }]),
        ),
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
    void loadAppointments();
  }, [residentFilter, statusFilter, canRead]);

  const createAppointment = async () => {
    if (!form.residentId || !form.title.trim() || !form.scheduledAt) return;

    setBusy(true);
    try {
      await apiRequest(`/api/admin/residents/${encodeURIComponent(form.residentId)}/appointments`, {
        method: 'POST',
        body: JSON.stringify({
          title: form.title,
          appointmentType: form.appointmentType || undefined,
          providerName: form.providerName || undefined,
          location: form.location || undefined,
          scheduledAt: new Date(form.scheduledAt).toISOString(),
          endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
          status: form.status,
          notes: form.notes || undefined,
        }),
      });

      setForm((state) => ({
        ...state,
        title: '',
        appointmentType: '',
        providerName: '',
        location: '',
        scheduledAt: '',
        endsAt: '',
        status: 'scheduled',
        notes: '',
      }));
      setResidentFilter('');
      setStatusFilter('');
      showToast('Appointment created.', 'success');
      await loadAppointments({ ignoreFilters: true });
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const updateAppointmentStatus = async (appointmentId: string) => {
    const draft = editing[appointmentId];
    if (!draft) return;

    setBusy(true);
    try {
      await apiRequest(`/api/admin/appointments/${encodeURIComponent(appointmentId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: draft.status,
        }),
      });
      if (statusFilter) {
        setStatusFilter('');
      }
      showToast('Appointment updated.', 'success');
      await loadAppointments({ ignoreFilters: true });
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const deleteAppointment = async () => {
    if (!appointmentToDelete) return;

    setBusy(true);
    try {
      await apiRequest(`/api/admin/appointments/${encodeURIComponent(appointmentToDelete)}`, {
        method: 'DELETE',
      });
      showToast('Appointment deleted.', 'success');
      setAppointmentToDelete(null);
      await loadAppointments({ ignoreFilters: true });
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!canRead) {
    return (
      <section>
        <h1 className="text-2xl font-semibold text-(--color-primary)">Appointments</h1>
        <p className="mt-1 text-sm text-(--color-primary)/70">
          You do not have permission to view appointments.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-(--color-primary)">Appointments</h1>
        <p className="mt-1 text-sm text-(--color-primary)/70">
          Manage resident appointments, providers, and outcomes.
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
            {appointmentStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void loadAppointments()}
            className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm text-(--color-primary) hover:bg-(--color-cream)"
          >
            Refresh
          </button>
        </div>
      </div>

      {canCreate ? (
        <div className="rounded-xl border border-(--color-primary)/20 bg-(--color-surface) p-4">
          <h2 className="text-sm font-semibold text-(--color-primary)">New Appointment</h2>
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
              placeholder="Title"
              value={form.title}
              onChange={(event) => setForm((state) => ({ ...state, title: event.target.value }))}
              className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            />
            <input
              type="datetime-local"
              value={form.scheduledAt}
              onChange={(event) => setForm((state) => ({ ...state, scheduledAt: event.target.value }))}
              className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            />
            <input
              placeholder="Type"
              value={form.appointmentType}
              onChange={(event) => setForm((state) => ({ ...state, appointmentType: event.target.value }))}
              className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            />
            <input
              placeholder="Provider"
              value={form.providerName}
              onChange={(event) => setForm((state) => ({ ...state, providerName: event.target.value }))}
              className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            />
            <input
              placeholder="Location"
              value={form.location}
              onChange={(event) => setForm((state) => ({ ...state, location: event.target.value }))}
              className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            />
            <input
              type="datetime-local"
              value={form.endsAt}
              onChange={(event) => setForm((state) => ({ ...state, endsAt: event.target.value }))}
              className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            />
            <select
              value={form.status}
              onChange={(event) =>
                setForm((state) => ({ ...state, status: event.target.value as AppointmentStatus }))
              }
              className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            >
              {appointmentStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <input
              placeholder="Notes"
              value={form.notes}
              onChange={(event) => setForm((state) => ({ ...state, notes: event.target.value }))}
              className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            />
          </div>
          <button
            type="button"
            onClick={() => void createAppointment()}
            disabled={busy || !form.residentId || !form.title.trim() || !form.scheduledAt}
            className="mt-3 rounded-md bg-(--color-primary) px-3.5 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Create appointment
          </button>
        </div>
      ) : null}

      <div className="rounded-xl border border-(--color-primary)/20 bg-(--color-surface) p-4">
        {loading ? (
          <p className="text-sm text-(--color-primary)/70">Loading appointments...</p>
        ) : appointments.length === 0 ? (
          <p className="text-sm text-(--color-primary)/70">No appointments found.</p>
        ) : (
          <div className="space-y-2">
            {appointments.map((appointment) => (
              <article
                key={appointment.id}
                className="rounded-xl border border-(--color-primary)/15 bg-(--color-surface) p-4 shadow-sm"
              >
                <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-base font-semibold text-(--color-primary)">
                        {appointment.title}
                      </p>
                      <span className="rounded-full bg-(--color-cream) px-2 py-0.5 text-xs text-(--color-primary)/80">
                        {residentLabelById[appointment.residentId] ?? 'Resident'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-(--color-primary)/70">
                      {new Date(appointment.scheduledAt).toLocaleString()}
                    </p>
                    <p className="text-sm text-(--color-primary)/65">
                      {appointment.appointmentType || 'General'} • {appointment.providerName || '-'} •{' '}
                      {appointment.location || '-'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={editing[appointment.id]?.status ?? appointment.status}
                      onChange={(event) =>
                        setEditing((state) => ({
                          ...state,
                          [appointment.id]: { status: event.target.value as AppointmentStatus },
                        }))
                      }
                      disabled={!canUpdate}
                      className="w-full rounded-md border border-(--color-primary)/25 px-2.5 py-2 text-sm outline-none focus:border-(--color-primary) disabled:opacity-60"
                    >
                      {appointmentStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    {canUpdate ? (
                      <button
                        type="button"
                        onClick={() => void updateAppointmentStatus(appointment.id)}
                        disabled={busy}
                        className="btn-edit px-3 py-2 disabled:opacity-50"
                      >
                        Save
                      </button>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    {canDelete ? (
                      <button
                        type="button"
                        onClick={() => setAppointmentToDelete(appointment.id)}
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
        open={!!appointmentToDelete}
        title="Delete Appointment"
        description="This appointment record will be permanently removed. Continue?"
        confirmLabel="Delete"
        destructive
        loading={busy}
        onCancel={() => setAppointmentToDelete(null)}
        onConfirm={() => {
          void deleteAppointment();
        }}
      />
    </section>
  );
};

export default AppointmentsPage;
