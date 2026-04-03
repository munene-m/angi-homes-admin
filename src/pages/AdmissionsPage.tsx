import { useCallback, useEffect, useMemo, useState } from 'react';
import ConfirmModal from '../components/ConfirmModal';
import { useAuthz } from '../contexts/AuthzContext';
import { useToast } from '../contexts/ToastContext';
import type { ApiError } from '../lib/api';
import { apiRequest } from '../lib/api';
import { permissionCodes } from '../lib/permissions';

type Resident = {
  id: string;
  firstName: string;
  lastName: string;
  residentNumber: string;
  isArchived: boolean;
};

type AdmissionStatus = 'planned' | 'admitted' | 'discharged' | 'cancelled';

type Admission = {
  id: string;
  residentId: string;
  admissionDate: string;
  dischargeDate: string | null;
  status: AdmissionStatus;
  source: string | null;
  reason: string | null;
  careLevel: string | null;
  physicianName: string | null;
  dischargeReason: string | null;
  dischargeNotes: string | null;
};

type AdmissionDraft = {
  status: AdmissionStatus;
  dischargeDate: string;
  source: string;
  careLevel: string;
};

const toInputDateTime = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const AdmissionsPage = () => {
  const { can } = useAuthz();
  const { showToast } = useToast();

  const canRead = can(permissionCodes.residentsRead);
  const canWrite = can(permissionCodes.residentsUpdate);

  const [residents, setResidents] = useState<Resident[]>([]);
  const [residentSearch, setResidentSearch] = useState('');
  const [selectedResidentId, setSelectedResidentId] = useState('');

  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [editing, setEditing] = useState<Record<string, AdmissionDraft>>({});
  const [admissionToDelete, setAdmissionToDelete] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState({
    admissionDate: '',
    status: 'planned' as AdmissionStatus,
    source: '',
    reason: '',
    careLevel: '',
    physicianName: '',
  });

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const selectedResident = useMemo(
    () => residents.find((resident) => resident.id === selectedResidentId) ?? null,
    [residents, selectedResidentId],
  );

  const filteredResidents = useMemo(() => {
    const term = residentSearch.trim().toLowerCase();
    if (!term) return residents;
    return residents.filter((resident) => {
      const name = `${resident.firstName} ${resident.lastName}`.toLowerCase();
      return name.includes(term) || resident.residentNumber.toLowerCase().includes(term);
    });
  }, [residentSearch, residents]);

  const toApiError = (error: unknown) => error as ApiError;

  const loadResidents = useCallback(async () => {
    if (!canRead) return;

    try {
      const response = await apiRequest<{ data: Resident[] }>('/api/admin/residents');
      setResidents(response.data);
      if (!selectedResidentId && response.data.length > 0) {
        setSelectedResidentId(response.data[0].id);
      }
      if (selectedResidentId && !response.data.some((resident) => resident.id === selectedResidentId)) {
        setSelectedResidentId(response.data[0]?.id ?? '');
      }
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    }
  }, [canRead, selectedResidentId, showToast]);

  const loadAdmissions = useCallback(async (residentId: string) => {
    if (!residentId || !canRead) return;

    setLoading(true);
    try {
      const response = await apiRequest<{ data: Admission[] }>(
        `/api/admin/residents/${encodeURIComponent(residentId)}/admissions`,
      );
      setAdmissions(response.data);
      setEditing(
        Object.fromEntries(
          response.data.map((admission) => [
            admission.id,
            {
              status: admission.status,
              dischargeDate: toInputDateTime(admission.dischargeDate),
              source: admission.source ?? '',
              careLevel: admission.careLevel ?? '',
            },
          ]),
        ),
      );
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [canRead, showToast]);

  useEffect(() => {
    void loadResidents();
  }, [loadResidents]);

  useEffect(() => {
    if (!selectedResidentId) {
      setAdmissions([]);
      return;
    }
    void loadAdmissions(selectedResidentId);
  }, [selectedResidentId, loadAdmissions]);

  const createAdmission = async () => {
    if (!selectedResidentId || !createForm.admissionDate) return;

    setBusy(true);
    try {
      await apiRequest(`/api/admin/residents/${encodeURIComponent(selectedResidentId)}/admissions`, {
        method: 'POST',
        body: JSON.stringify({
          admissionDate: new Date(createForm.admissionDate).toISOString(),
          status: createForm.status,
          source: createForm.source || undefined,
          reason: createForm.reason || undefined,
          careLevel: createForm.careLevel || undefined,
          physicianName: createForm.physicianName || undefined,
        }),
      });

      setCreateForm({
        admissionDate: '',
        status: 'planned',
        source: '',
        reason: '',
        careLevel: '',
        physicianName: '',
      });
      showToast('Admission created.', 'success');
      await loadAdmissions(selectedResidentId);
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const updateAdmission = async (admissionId: string) => {
    if (!selectedResidentId) return;

    const draft = editing[admissionId];
    if (!draft) return;

    setBusy(true);
    try {
      await apiRequest(
        `/api/admin/residents/${encodeURIComponent(selectedResidentId)}/admissions/${encodeURIComponent(admissionId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status: draft.status,
            dischargeDate: draft.dischargeDate
              ? new Date(draft.dischargeDate).toISOString()
              : undefined,
            source: draft.source || undefined,
            careLevel: draft.careLevel || undefined,
          }),
        },
      );
      showToast('Admission updated.', 'success');
      await loadAdmissions(selectedResidentId);
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const deleteAdmission = async () => {
    if (!selectedResidentId || !admissionToDelete) return;

    setBusy(true);
    try {
      await apiRequest(
        `/api/admin/residents/${encodeURIComponent(selectedResidentId)}/admissions/${encodeURIComponent(admissionToDelete)}`,
        { method: 'DELETE' },
      );
      showToast('Admission deleted.', 'success');
      setAdmissionToDelete(null);
      await loadAdmissions(selectedResidentId);
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!canRead) {
    return (
      <section>
        <h1 className="text-2xl font-semibold text-(--color-primary)">Admissions</h1>
        <p className="mt-1 text-sm text-(--color-primary)/70">
          You do not have permission to view admissions.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-(--color-primary)">Admissions</h1>
        <p className="mt-1 text-sm text-(--color-primary)/70">
          Manage resident admissions, discharge details, and current status.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-xl border border-(--color-primary)/20 bg-(--color-surface) p-3">
          <input
            placeholder="Search residents..."
            value={residentSearch}
            onChange={(event) => setResidentSearch(event.target.value)}
            className="mb-2 w-full rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
          />
          <div className="max-h-[65vh] overflow-auto">
            {filteredResidents.map((resident) => (
              <button
                key={resident.id}
                type="button"
                onClick={() => setSelectedResidentId(resident.id)}
                className={`mb-2 block w-full rounded-md border px-3 py-2 text-left ${
                  selectedResidentId === resident.id
                    ? 'border-(--color-primary) bg-(--color-cream)'
                    : 'border-(--color-primary)/15 bg-white'
                }`}
              >
                <p className="text-sm font-medium text-(--color-primary)">
                  {resident.firstName} {resident.lastName}
                </p>
                <p className="text-xs text-(--color-primary)/60">{resident.residentNumber}</p>
              </button>
            ))}
            {filteredResidents.length === 0 ? (
              <p className="px-1 py-3 text-sm text-(--color-primary)/70">No residents found.</p>
            ) : null}
          </div>
        </aside>

        <div className="rounded-xl border border-(--color-primary)/20 bg-(--color-surface) p-4">
          {!selectedResident ? (
            <p className="text-sm text-(--color-primary)/70">Select a resident to continue.</p>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">
                    {selectedResident.firstName} {selectedResident.lastName}
                  </h2>
                  <p className="text-xs text-(--color-primary)/65">{selectedResident.residentNumber}</p>
                </div>
              </div>

              {canWrite ? (
                <div className="mb-4 rounded-lg border border-(--color-primary)/15 p-3">
                  <h3 className="text-sm font-semibold">Add Admission</h3>
                  <div className="mt-2 grid gap-2 md:grid-cols-3">
                    <input
                      type="datetime-local"
                      value={createForm.admissionDate}
                      onChange={(event) =>
                        setCreateForm((state) => ({ ...state, admissionDate: event.target.value }))
                      }
                      className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                    />
                    <select
                      value={createForm.status}
                      onChange={(event) =>
                        setCreateForm((state) => ({
                          ...state,
                          status: event.target.value as AdmissionStatus,
                        }))
                      }
                      className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                    >
                      <option value="planned">Planned</option>
                      <option value="admitted">Admitted</option>
                      <option value="discharged">Discharged</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                    <input
                      placeholder="Source"
                      value={createForm.source}
                      onChange={(event) =>
                        setCreateForm((state) => ({ ...state, source: event.target.value }))
                      }
                      className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                    />
                    <input
                      placeholder="Care level"
                      value={createForm.careLevel}
                      onChange={(event) =>
                        setCreateForm((state) => ({ ...state, careLevel: event.target.value }))
                      }
                      className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                    />
                    <input
                      placeholder="Physician"
                      value={createForm.physicianName}
                      onChange={(event) =>
                        setCreateForm((state) => ({ ...state, physicianName: event.target.value }))
                      }
                      className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                    />
                    <input
                      placeholder="Reason"
                      value={createForm.reason}
                      onChange={(event) =>
                        setCreateForm((state) => ({ ...state, reason: event.target.value }))
                      }
                      className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void createAdmission()}
                    disabled={busy || !createForm.admissionDate}
                    className="mt-3 rounded-md bg-(--color-primary) px-3.5 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Add admission
                  </button>
                </div>
              ) : null}

              {loading ? (
                <p className="text-sm text-(--color-primary)/70">Loading admissions...</p>
              ) : admissions.length === 0 ? (
                <p className="text-sm text-(--color-primary)/70">No admissions found for this resident.</p>
              ) : (
                <div className="space-y-2">
                  {admissions.map((admission) => {
                    const draft = editing[admission.id];
                    return (
                      <div key={admission.id} className="rounded-lg border border-(--color-primary)/15 p-3">
                        <div className="grid gap-2 md:grid-cols-4">
                          <div>
                            <p className="text-xs uppercase text-(--color-primary)/50">Admission date</p>
                            <p className="text-sm text-(--color-primary)/85">
                              {new Date(admission.admissionDate).toLocaleString()}
                            </p>
                          </div>
                          <label className="grid gap-1 text-xs text-(--color-primary)/65">
                            Status
                            <select
                              value={draft?.status ?? admission.status}
                              onChange={(event) =>
                                setEditing((state) => ({
                                  ...state,
                                  [admission.id]: {
                                    ...(state[admission.id] ?? {
                                      status: admission.status,
                                      dischargeDate: toInputDateTime(admission.dischargeDate),
                                      source: admission.source ?? '',
                                      careLevel: admission.careLevel ?? '',
                                    }),
                                    status: event.target.value as AdmissionStatus,
                                  },
                                }))
                              }
                              disabled={!canWrite}
                              className="rounded-md border border-(--color-primary)/25 px-2.5 py-2 text-sm outline-none focus:border-(--color-primary) disabled:opacity-60"
                            >
                              <option value="planned">Planned</option>
                              <option value="admitted">Admitted</option>
                              <option value="discharged">Discharged</option>
                              <option value="cancelled">Cancelled</option>
                            </select>
                          </label>
                          <label className="grid gap-1 text-xs text-(--color-primary)/65">
                            Discharge date
                            <input
                              type="datetime-local"
                              value={draft?.dischargeDate ?? toInputDateTime(admission.dischargeDate)}
                              onChange={(event) =>
                                setEditing((state) => ({
                                  ...state,
                                  [admission.id]: {
                                    ...(state[admission.id] ?? {
                                      status: admission.status,
                                      dischargeDate: toInputDateTime(admission.dischargeDate),
                                      source: admission.source ?? '',
                                      careLevel: admission.careLevel ?? '',
                                    }),
                                    dischargeDate: event.target.value,
                                  },
                                }))
                              }
                              disabled={!canWrite}
                              className="rounded-md border border-(--color-primary)/25 px-2.5 py-2 text-sm outline-none focus:border-(--color-primary) disabled:opacity-60"
                            />
                          </label>
                          <div className="flex items-end gap-2">
                            {canWrite ? (
                              <button
                                type="button"
                                onClick={() => void updateAdmission(admission.id)}
                                disabled={busy}
                                className="btn-edit px-3 py-2 disabled:opacity-50"
                              >
                                Save
                              </button>
                            ) : null}
                            {canWrite ? (
                              <button
                                type="button"
                                onClick={() => setAdmissionToDelete(admission.id)}
                                disabled={busy}
                                className="btn-delete px-3 py-2 disabled:opacity-50"
                              >
                                Delete
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmModal
        open={!!admissionToDelete}
        title="Delete Admission"
        description="This admission record will be removed. Continue?"
        confirmLabel="Delete"
        destructive
        loading={busy}
        onCancel={() => setAdmissionToDelete(null)}
        onConfirm={() => {
          void deleteAdmission();
        }}
      />
    </section>
  );
};

export default AdmissionsPage;
