import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Pencil, Trash2 } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';
import { useAuthz } from '../contexts/AuthzContext';
import { useToast } from '../contexts/ToastContext';
import type { ApiError } from '../lib/api';
import { apiRequest } from '../lib/api';
import { permissionCodes } from '../lib/permissions';
import { isValidEmail, isValidKenyanPhone, normalizeKenyanPhone } from '../lib/validation';

type StaffStatus = 'active' | 'inactive' | 'suspended';
type ShiftStatus = 'scheduled' | 'completed' | 'missed' | 'cancelled';
type Rating = 'poor' | 'fair' | 'good' | 'very_good' | 'excellent';

type Role = {
  id: string;
  name: string;
  code: string;
};

type Shift = {
  id: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  department: string | null;
  roleLabel: string | null;
  status: ShiftStatus;
};

type Review = {
  id: string;
  reviewDate: string;
  rating: Rating;
  summary: string | null;
};

type StaffListItem = {
  id: string;
  name: string;
  email: string;
  status: StaffStatus;
  phoneNumber: string | null;
  profile: {
    department: string | null;
    jobTitle: string | null;
    employeeId: string | null;
  } | null;
  roles: Array<{ id: string; code: string; name: string }>;
};

type StaffRecord = StaffListItem & {
  shifts: Shift[];
  performanceReviews: Review[];
};

type StaffCreateForm = {
  name: string;
  email: string;
  password: string;
  status: StaffStatus;
  phoneNumber: string;
  jobTitle: string;
  department: string;
  roleCodes: string[];
};

const defaultCreateForm: StaffCreateForm = {
  name: '',
  email: '',
  password: '',
  status: 'active',
  phoneNumber: '',
  jobTitle: '',
  department: '',
  roleCodes: [],
};

const StaffManagementPage = () => {
  const { can } = useAuthz();
  const { showToast } = useToast();

  const canRead = can(permissionCodes.staffRead);
  const canCreate = can(permissionCodes.staffCreate);
  const canUpdate = can(permissionCodes.staffUpdate);
  const canDelete = can(permissionCodes.staffDelete);

  const [staff, setStaff] = useState<StaffListItem[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [selectedStaff, setSelectedStaff] = useState<StaffRecord | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<StaffCreateForm>(defaultCreateForm);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [creating, setCreating] = useState(false);

  const [editForm, setEditForm] = useState<{
    id: string;
    name: string;
    status: StaffStatus;
    phoneNumber: string;
    employeeId: string;
    jobTitle: string;
    department: string;
    roleCodes: string[];
  } | null>(null);
  const [updating, setUpdating] = useState(false);
  const [confirmDeleteStaffId, setConfirmDeleteStaffId] = useState<string | null>(null);
  const [deletingStaffId, setDeletingStaffId] = useState<string | null>(null);

  const [newShift, setNewShift] = useState({
    shiftDate: '',
    startTime: '',
    endTime: '',
    department: '',
    roleLabel: '',
    status: 'scheduled' as ShiftStatus,
  });

  const [newReview, setNewReview] = useState({
    reviewDate: '',
    rating: 'good' as Rating,
    summary: '',
  });

  const [actionBusy, setActionBusy] = useState(false);
  const [assigningCareStaffId, setAssigningCareStaffId] = useState<string | null>(null);

  const toApiError = (error: unknown) => error as ApiError;

  const loadStaff = async () => {
    if (!canRead) return;

    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set('q', search.trim());
      if (statusFilter) query.set('status', statusFilter);

      const [staffResponse, rolesResponse] = await Promise.all([
        apiRequest<{ data: StaffListItem[] }>(
          `/api/admin/staff${query.toString() ? `?${query.toString()}` : ''}`,
        ),
        apiRequest<{ data: Role[] }>('/api/admin/roles'),
      ]);
      setStaff(staffResponse.data);
      setRoles(rolesResponse.data);

      if (!selectedStaffId && staffResponse.data.length > 0) {
        setSelectedStaffId(staffResponse.data[0].id);
      }
      if (
        selectedStaffId &&
        !staffResponse.data.some((staffMember) => staffMember.id === selectedStaffId)
      ) {
        setSelectedStaffId(staffResponse.data[0]?.id ?? '');
      }
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadStaffDetail = async (staffId: string) => {
    if (!staffId) {
      setSelectedStaff(null);
      return;
    }
    try {
      const response = await apiRequest<{ data: StaffRecord }>(
        `/api/admin/staff/${encodeURIComponent(staffId)}`,
      );
      setSelectedStaff(response.data);
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadStaff();
    }, 240);
    return () => window.clearTimeout(timer);
  }, [search, statusFilter, canRead]);

  useEffect(() => {
    if (!selectedStaffId || !canRead) return;
    void loadStaffDetail(selectedStaffId);
  }, [selectedStaffId, canRead]);

  const toggleRoleCode = (codes: string[], roleCode: string, setter: (next: string[]) => void) => {
    if (codes.includes(roleCode)) {
      setter(codes.filter((code) => code !== roleCode));
      return;
    }
    setter([...codes, roleCode]);
  };

  const handleCreateStaff = async () => {
    if (!createForm.name.trim()) {
      showToast('Name is required.', 'error');
      return;
    }
    if (!isValidEmail(createForm.email)) {
      showToast('Enter a valid email.', 'error');
      return;
    }
    if (createForm.password.length < 8) {
      showToast('Password must be at least 8 characters.', 'error');
      return;
    }
    if (createForm.phoneNumber.trim() && !isValidKenyanPhone(createForm.phoneNumber)) {
      showToast('Phone number must be a valid Kenyan number.', 'error');
      return;
    }

    setCreating(true);
    try {
      const response = await apiRequest<{ data: StaffRecord }>('/api/admin/staff', {
        method: 'POST',
        body: JSON.stringify({
          ...createForm,
          phoneNumber: createForm.phoneNumber
            ? normalizeKenyanPhone(createForm.phoneNumber)
            : undefined,
          jobTitle: createForm.jobTitle || undefined,
          department: createForm.department || undefined,
        }),
      });
      setCreateForm(defaultCreateForm);
      setCreateOpen(false);
      setSearch('');
      setStatusFilter('');
      showToast('Staff created.', 'success');
      await loadStaff();
      setSelectedStaffId(response.data.id);
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateStaff = async () => {
    if (!editForm) return;

    if (!editForm.name.trim()) {
      showToast('Name is required.', 'error');
      return;
    }
    if (editForm.phoneNumber.trim() && !isValidKenyanPhone(editForm.phoneNumber)) {
      showToast('Phone number must be a valid Kenyan number.', 'error');
      return;
    }

    setUpdating(true);
    try {
      await apiRequest(`/api/admin/staff/${encodeURIComponent(editForm.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editForm.name,
          status: editForm.status,
          phoneNumber: editForm.phoneNumber
            ? normalizeKenyanPhone(editForm.phoneNumber)
            : undefined,
          employeeId: editForm.employeeId || undefined,
          jobTitle: editForm.jobTitle || undefined,
          department: editForm.department || undefined,
          roleCodes: editForm.roleCodes,
        }),
      });
      setEditForm(null);
      showToast('Staff updated.', 'success');
      await loadStaff();
      await loadStaffDetail(editForm.id);
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteStaff = async (staffId: string) => {
    setDeletingStaffId(staffId);
    try {
      await apiRequest(`/api/admin/staff/${encodeURIComponent(staffId)}`, { method: 'DELETE' });
      showToast('Staff deleted.', 'success');
      setConfirmDeleteStaffId(null);
      if (selectedStaffId === staffId) setSelectedStaffId('');
      await loadStaff();
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setDeletingStaffId(null);
    }
  };

  const handleAssignCareStaffRole = async (staffId: string) => {
    setAssigningCareStaffId(staffId);
    try {
      await apiRequest(`/api/admin/staff/${encodeURIComponent(staffId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          roleCodes: ['care_staff'],
        }),
      });
      showToast('Care Staff role assigned.', 'success');
      await loadStaff();
      await loadStaffDetail(staffId);
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setAssigningCareStaffId(null);
    }
  };

  const handleCreateShift = async () => {
    if (!selectedStaffId || !newShift.shiftDate || !newShift.startTime || !newShift.endTime) return;
    setActionBusy(true);
    try {
      await apiRequest(`/api/admin/staff/${encodeURIComponent(selectedStaffId)}/shifts`, {
        method: 'POST',
        body: JSON.stringify({
          ...newShift,
          department: newShift.department || undefined,
          roleLabel: newShift.roleLabel || undefined,
        }),
      });
      setNewShift({
        shiftDate: '',
        startTime: '',
        endTime: '',
        department: '',
        roleLabel: '',
        status: 'scheduled',
      });
      showToast('Shift created.', 'success');
      await loadStaffDetail(selectedStaffId);
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handleUpdateShiftStatus = async (shiftId: string, status: ShiftStatus) => {
    setActionBusy(true);
    try {
      await apiRequest(`/api/admin/staff/shifts/${encodeURIComponent(shiftId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      showToast('Shift updated.', 'success');
      if (selectedStaffId) await loadStaffDetail(selectedStaffId);
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCreateReview = async () => {
    if (!selectedStaffId || !newReview.reviewDate) return;
    setActionBusy(true);
    try {
      await apiRequest(`/api/admin/staff/${encodeURIComponent(selectedStaffId)}/performance-reviews`, {
        method: 'POST',
        body: JSON.stringify({
          reviewDate: newReview.reviewDate,
          rating: newReview.rating,
          summary: newReview.summary || undefined,
        }),
      });
      setNewReview({ reviewDate: '', rating: 'good', summary: '' });
      showToast('Performance review created.', 'success');
      await loadStaffDetail(selectedStaffId);
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const selectedShifts = useMemo(() => selectedStaff?.shifts ?? [], [selectedStaff]);
  const selectedReviews = useMemo(
    () => selectedStaff?.performanceReviews ?? [],
    [selectedStaff],
  );

  if (!canRead) {
    return (
      <section>
        <h1 className="text-2xl font-semibold text-(--color-primary)">Staff Management</h1>
        <p className="mt-1 text-sm text-(--color-primary)/70">
          You do not have permission to access staff records.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-(--color-primary)">Staff Management</h1>
          <p className="mt-1 text-sm text-(--color-primary)/70">
            Manage staff users, shifts, and performance reviews.
          </p>
        </div>
        {canCreate ? (
          <button
            type="button"
            onClick={() => setCreateOpen((prev) => !prev)}
            className="rounded-lg bg-(--color-primary) px-3.5 py-2 text-sm font-medium text-white hover:bg-(--color-primary)/90"
          >
            {createOpen ? 'Close form' : 'New staff'}
          </button>
        ) : null}
      </div>

      {createOpen ? (
        <div className="rounded-xl border border-(--color-primary)/20 bg-(--color-surface) p-4">
          <h2 className="text-lg font-semibold">Create Staff</h2>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <input
              placeholder="Full name"
              value={createForm.name}
              onChange={(event) => setCreateForm((state) => ({ ...state, name: event.target.value }))}
              className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            />
            <input
              type="email"
              placeholder="Email"
              value={createForm.email}
              onChange={(event) => setCreateForm((state) => ({ ...state, email: event.target.value }))}
              className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            />
            <div className="relative">
              <input
                type={showCreatePassword ? 'text' : 'password'}
                placeholder="Temporary password"
                value={createForm.password}
                onChange={(event) =>
                  setCreateForm((state) => ({ ...state, password: event.target.value }))
                }
                className="w-full rounded-md border border-(--color-primary)/25 px-3 py-2 pr-10 text-sm outline-none focus:border-(--color-primary)"
              />
              <button
                type="button"
                aria-label={showCreatePassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowCreatePassword((value) => !value)}
                className="absolute inset-y-0 right-1 inline-flex items-center rounded-md px-2 text-(--color-primary)/65 hover:text-(--color-primary)"
              >
                {showCreatePassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <input
              type="tel"
              placeholder="Phone"
              value={createForm.phoneNumber}
              onChange={(event) => setCreateForm((state) => ({ ...state, phoneNumber: event.target.value }))}
              className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            />
            <input
              placeholder="Job title"
              value={createForm.jobTitle}
              onChange={(event) => setCreateForm((state) => ({ ...state, jobTitle: event.target.value }))}
              className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            />
            <input
              placeholder="Department"
              value={createForm.department}
              onChange={(event) => setCreateForm((state) => ({ ...state, department: event.target.value }))}
              className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            />
            <select
              value={createForm.status}
              onChange={(event) =>
                setCreateForm((state) => ({ ...state, status: event.target.value as StaffStatus }))
              }
              className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {roles.map((role) => (
              <label
                key={role.id}
                className="inline-flex items-center gap-2 rounded-md border border-(--color-primary)/15 bg-white px-3 py-2 text-sm text-(--color-primary)/85"
              >
                <input
                  type="checkbox"
                  checked={createForm.roleCodes.includes(role.code)}
                  onChange={() =>
                    toggleRoleCode(createForm.roleCodes, role.code, (next) =>
                      setCreateForm((state) => ({ ...state, roleCodes: next })),
                    )
                  }
                />
                <span>{role.name}</span>
              </label>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void handleCreateStaff()}
            disabled={creating}
            className="mt-3 rounded-md bg-(--color-primary) px-3.5 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {creating ? 'Saving...' : 'Create staff'}
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <aside className="rounded-xl border border-(--color-primary)/20 bg-(--color-surface) p-3">
          <div className="grid gap-2">
            <input
              placeholder="Search staff..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          <div className="mt-3 max-h-[65vh] overflow-auto">
            {loading ? <p className="text-sm text-(--color-primary)/70">Loading...</p> : null}
            {staff.map((staffMember) => (
              <div
                key={staffMember.id}
                className={`mb-2 rounded-md border px-3 py-2 ${
                  selectedStaffId === staffMember.id
                    ? 'border-(--color-primary) bg-(--color-cream)'
                    : 'border-(--color-primary)/15 bg-white'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedStaffId(staffMember.id)}
                  className="w-full text-left"
                >
                  <p className="text-sm font-medium text-(--color-primary)">{staffMember.name}</p>
                  <p className="text-xs text-(--color-primary)/65">
                    {staffMember.profile?.department || 'No department'} • {staffMember.status}
                  </p>
                </button>
                <div className="mt-2 flex gap-2">
                  {canUpdate ? (
                    <button
                      type="button"
                      title="Edit staff"
                      aria-label="Edit staff"
                      onClick={() =>
                        setEditForm({
                          id: staffMember.id,
                          name: staffMember.name,
                          status: staffMember.status,
                          phoneNumber: staffMember.phoneNumber ?? '',
                          employeeId: staffMember.profile?.employeeId ?? '',
                          jobTitle: staffMember.profile?.jobTitle ?? '',
                          department: staffMember.profile?.department ?? '',
                          roleCodes: staffMember.roles.map((role) => role.code),
                        })
                      }
                      className="btn-edit inline-flex items-center justify-center p-1.5"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  ) : null}
                  {canDelete ? (
                    <button
                      type="button"
                      title="Delete staff"
                      aria-label="Delete staff"
                      onClick={() => setConfirmDeleteStaffId(staffMember.id)}
                      className="btn-delete inline-flex items-center justify-center p-1.5"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <div className="rounded-xl border border-(--color-primary)/20 bg-(--color-surface) p-4">
          {!selectedStaff ? (
            <p className="text-sm text-(--color-primary)/70">Select a staff member to continue.</p>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-(--color-primary)">{selectedStaff.name}</h2>
                <p className="text-sm text-(--color-primary)/70">
                  {selectedStaff.email} • {selectedStaff.profile?.jobTitle || 'No title'}
                </p>
                <p className="text-xs text-(--color-primary)/60">
                  Employee ID: {selectedStaff.profile?.employeeId || 'Not assigned'}
                </p>
                <p className="text-xs text-(--color-primary)/60">
                  Roles: {selectedStaff.roles.map((role) => role.name).join(', ') || 'None'}
                </p>
                {canUpdate && !selectedStaff.roles.some((role) => role.code === 'care_staff') ? (
                  <button
                    type="button"
                    onClick={() => void handleAssignCareStaffRole(selectedStaff.id)}
                    disabled={assigningCareStaffId === selectedStaff.id}
                    className="mt-2 rounded-md bg-(--color-primary) px-3 py-1.5 text-xs text-white disabled:opacity-50"
                  >
                    {assigningCareStaffId === selectedStaff.id
                      ? 'Assigning...'
                      : 'Assign Care Staff role'}
                  </button>
                ) : null}
              </div>

              {editForm?.id === selectedStaff.id ? (
                <div className="rounded-lg border border-(--color-primary)/15 p-3">
                  <h3 className="text-sm font-semibold">Edit Staff</h3>
                  <div className="mt-2 grid gap-2 md:grid-cols-3">
                    <input
                      value={editForm.name}
                      onChange={(event) =>
                        setEditForm((state) => (state ? { ...state, name: event.target.value } : state))
                      }
                      className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                    />
                    <input
                      type="tel"
                      value={editForm.phoneNumber}
                      onChange={(event) =>
                        setEditForm((state) =>
                          state ? { ...state, phoneNumber: event.target.value } : state,
                        )
                      }
                      className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                    />
                    <input
                      value={editForm.department}
                      onChange={(event) =>
                        setEditForm((state) =>
                          state ? { ...state, department: event.target.value } : state,
                        )
                      }
                      className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                    />
                    <input
                      value={editForm.jobTitle}
                      onChange={(event) =>
                        setEditForm((state) =>
                          state ? { ...state, jobTitle: event.target.value } : state,
                        )
                      }
                      className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                    />
                    <input
                      value={editForm.employeeId}
                      readOnly
                      disabled
                      className="cursor-not-allowed rounded-md border border-(--color-primary)/20 bg-(--color-primary)/5 px-3 py-2 text-sm text-(--color-primary)/65 outline-none"
                    />
                    <select
                      value={editForm.status}
                      onChange={(event) =>
                        setEditForm((state) =>
                          state ? { ...state, status: event.target.value as StaffStatus } : state,
                        )
                      }
                      className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="suspended">Suspended</option>
                    </select>
                  </div>
                  <div className="mt-2 grid gap-2 md:grid-cols-3">
                    {roles.map((role) => (
                      <label
                        key={role.id}
                        className="inline-flex items-center gap-2 rounded-md border border-(--color-primary)/15 bg-white px-3 py-2 text-xs text-(--color-primary)/85"
                      >
                        <input
                          type="checkbox"
                          checked={editForm.roleCodes.includes(role.code)}
                          onChange={() =>
                            toggleRoleCode(editForm.roleCodes, role.code, (next) =>
                              setEditForm((state) =>
                                state ? { ...state, roleCodes: next } : state,
                              ),
                            )
                          }
                        />
                        <span>{role.name}</span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleUpdateStaff()}
                      disabled={updating}
                      className="rounded-md bg-(--color-primary) px-3 py-2 text-sm text-white disabled:opacity-50"
                    >
                      {updating ? 'Saving...' : 'Save changes'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditForm(null)}
                      className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm text-(--color-primary)"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 xl:grid-cols-2">
                <section className="rounded-lg border border-(--color-primary)/15 p-3">
                  <h3 className="text-sm font-semibold">Shifts</h3>
                  {canUpdate ? (
                    <div className="mt-2 grid gap-2">
                      <p className="text-xs text-(--color-primary)/65">
                        Shift date is the working day. Start and end time define the exact on-duty
                        window for that day.
                      </p>
                      <div className="grid gap-2 md:grid-cols-2">
                        <label className="grid gap-1">
                          <span className="text-xs text-(--color-primary)/70">Shift date</span>
                          <input
                            type="date"
                            value={newShift.shiftDate}
                            onChange={(event) =>
                              setNewShift((state) => ({ ...state, shiftDate: event.target.value }))
                            }
                            className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="grid gap-1">
                          <span className="text-xs text-(--color-primary)/70">
                            Start time (clock in)
                          </span>
                          <input
                            type="time"
                            value={newShift.startTime}
                            onChange={(event) =>
                              setNewShift((state) => ({ ...state, startTime: event.target.value }))
                            }
                            className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="grid gap-1">
                          <span className="text-xs text-(--color-primary)/70">
                            End time (clock out)
                          </span>
                          <input
                            type="time"
                            value={newShift.endTime}
                            onChange={(event) =>
                              setNewShift((state) => ({ ...state, endTime: event.target.value }))
                            }
                            className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="grid gap-1">
                          <span className="text-xs text-(--color-primary)/70">
                            Initial shift status
                          </span>
                          <select
                            value={newShift.status}
                            onChange={(event) =>
                              setNewShift((state) => ({
                                ...state,
                                status: event.target.value as ShiftStatus,
                              }))
                            }
                            className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm"
                          >
                            <option value="scheduled">Scheduled</option>
                            <option value="completed">Completed</option>
                            <option value="missed">Missed</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleCreateShift()}
                        disabled={actionBusy}
                        className="rounded-md bg-(--color-primary) px-3 py-2 text-sm text-white disabled:opacity-50"
                      >
                        Add shift
                      </button>
                    </div>
                  ) : null}
                  <div className="mt-3 space-y-2">
                    {selectedShifts.map((shift) => (
                      <div key={shift.id} className="rounded-md border border-(--color-primary)/12 p-2">
                        <p className="text-sm text-(--color-primary)">
                          {shift.shiftDate} • {shift.startTime}-{shift.endTime}
                        </p>
                        <div className="mt-1 flex items-center justify-between">
                          <p className="text-xs text-(--color-primary)/65">{shift.status}</p>
                          {canUpdate ? (
                            <select
                              value={shift.status}
                              onChange={(event) =>
                                void handleUpdateShiftStatus(
                                  shift.id,
                                  event.target.value as ShiftStatus,
                                )
                              }
                              className="rounded-md border border-(--color-primary)/20 px-2 py-1 text-xs"
                            >
                              <option value="scheduled">scheduled</option>
                              <option value="completed">completed</option>
                              <option value="missed">missed</option>
                              <option value="cancelled">cancelled</option>
                            </select>
                          ) : null}
                        </div>
                      </div>
                    ))}
                    {selectedShifts.length === 0 ? (
                      <p className="text-sm text-(--color-primary)/70">No shifts yet.</p>
                    ) : null}
                  </div>
                </section>

                <section className="rounded-lg border border-(--color-primary)/15 p-3">
                  <h3 className="text-sm font-semibold">Performance Reviews</h3>
                  {canUpdate ? (
                    <div className="mt-2 grid gap-2">
                      <div className="grid gap-2 md:grid-cols-2">
                        <input
                          type="date"
                          value={newReview.reviewDate}
                          onChange={(event) =>
                            setNewReview((state) => ({ ...state, reviewDate: event.target.value }))
                          }
                          className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm"
                        />
                        <select
                          value={newReview.rating}
                          onChange={(event) =>
                            setNewReview((state) => ({
                              ...state,
                              rating: event.target.value as Rating,
                            }))
                          }
                          className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm"
                        >
                          <option value="poor">poor</option>
                          <option value="fair">fair</option>
                          <option value="good">good</option>
                          <option value="very_good">very_good</option>
                          <option value="excellent">excellent</option>
                        </select>
                      </div>
                      <input
                        placeholder="Summary"
                        value={newReview.summary}
                        onChange={(event) =>
                          setNewReview((state) => ({ ...state, summary: event.target.value }))
                        }
                        className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => void handleCreateReview()}
                        disabled={actionBusy}
                        className="rounded-md bg-(--color-primary) px-3 py-2 text-sm text-white disabled:opacity-50"
                      >
                        Add review
                      </button>
                    </div>
                  ) : null}
                  <div className="mt-3 space-y-2">
                    {selectedReviews.map((review) => (
                      <div key={review.id} className="rounded-md border border-(--color-primary)/12 p-2">
                        <p className="text-sm text-(--color-primary)">
                          {review.reviewDate} • {review.rating}
                        </p>
                        <p className="text-xs text-(--color-primary)/65">
                          {review.summary || 'No summary'}
                        </p>
                      </div>
                    ))}
                    {selectedReviews.length === 0 ? (
                      <p className="text-sm text-(--color-primary)/70">No reviews yet.</p>
                    ) : null}
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={Boolean(confirmDeleteStaffId)}
        title="Delete Staff"
        description="This action is permanent. Do you want to delete this staff user?"
        confirmLabel="Delete staff"
        destructive
        loading={Boolean(confirmDeleteStaffId && deletingStaffId === confirmDeleteStaffId)}
        onCancel={() => setConfirmDeleteStaffId(null)}
        onConfirm={() => {
          if (confirmDeleteStaffId) void handleDeleteStaff(confirmDeleteStaffId);
        }}
      />
    </section>
  );
};

export default StaffManagementPage;
