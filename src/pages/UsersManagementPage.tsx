import { useEffect, useState } from 'react';
import { Eye, EyeOff, Pencil, Trash2 } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';
import { useAuthz } from '../contexts/AuthzContext';
import { useToast } from '../contexts/ToastContext';
import type { ApiError } from '../lib/api';
import { apiRequest } from '../lib/api';
import { permissionCodes } from '../lib/permissions';
import { isValidEmail, isValidKenyanPhone, normalizeKenyanPhone } from '../lib/validation';

type Role = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  isSystem: boolean;
};

type UserRole = {
  id: string;
  name: string;
  code: string;
  description: string | null;
};

type UserProfile = {
  department: string | null;
  jobTitle: string | null;
} | null;

type AdminUser = {
  id: string;
  name: string;
  email: string;
  userType: 'admin' | 'staff';
  status: 'active' | 'inactive' | 'suspended';
  phoneNumber: string | null;
  roles: UserRole[];
  profile: UserProfile;
};

type UsersResponse = { data: AdminUser[] };
type RolesResponse = { data: Role[] };

type UserFormState = {
  name: string;
  email: string;
  password: string;
  userType: 'admin' | 'staff';
  status: 'active' | 'inactive' | 'suspended';
  phoneNumber: string;
  roleCodes: string[];
};

type EditFormState = {
  id: string;
  name: string;
  userType: 'admin' | 'staff';
  status: 'active' | 'inactive' | 'suspended';
  phoneNumber: string;
  roleCodes: string[];
};

const defaultCreateForm: UserFormState = {
  name: '',
  email: '',
  password: '',
  userType: 'staff',
  status: 'active',
  phoneNumber: '',
  roleCodes: [],
};

const UsersManagementPage = () => {
  const { can, refresh } = useAuthz();
  const { showToast } = useToast();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<UserFormState>(defaultCreateForm);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [creating, setCreating] = useState(false);

  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [updating, setUpdating] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);

  const loadData = async (searchTerm?: string) => {
    setLoading(true);
    setError(null);

    try {
      const [usersResponse, rolesResponse] = await Promise.all([
        apiRequest<UsersResponse>(
          `/api/admin/users${searchTerm ? `?q=${encodeURIComponent(searchTerm)}` : ''}`,
        ),
        apiRequest<RolesResponse>('/api/admin/roles'),
      ]);

      setUsers(usersResponse.data);
      setRoles(rolesResponse.data);
    } catch (requestError) {
      const typedError = requestError as ApiError;
      setError(typedError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData(search.trim());
    }, 280);

    return () => window.clearTimeout(timer);
  }, [search]);

  const handleToggleRole = (
    roleCodes: string[],
    roleCode: string,
    update: (nextCodes: string[]) => void,
  ) => {
    if (roleCodes.includes(roleCode)) {
      update(roleCodes.filter((code) => code !== roleCode));
      return;
    }

    update([...roleCodes, roleCode]);
  };

  const handleCreate = async () => {
    if (!createForm.name.trim()) {
      showToast('Name is required.', 'error');
      return;
    }

    if (!isValidEmail(createForm.email)) {
      showToast('Enter a valid email address.', 'error');
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
      await apiRequest('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          ...createForm,
          phoneNumber: createForm.phoneNumber
            ? normalizeKenyanPhone(createForm.phoneNumber)
            : undefined,
        }),
      });

      setCreateForm(defaultCreateForm);
      setCreateOpen(false);
      setSearch('');
      showToast('User created successfully.', 'success');
      await loadData();
      await refresh();
    } catch (requestError) {
      const typedError = requestError as ApiError;
      showToast(typedError.message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async () => {
    if (!editForm) {
      return;
    }

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
      await apiRequest(`/api/admin/users/${encodeURIComponent(editForm.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editForm.name,
          userType: editForm.userType,
          status: editForm.status,
          phoneNumber: editForm.phoneNumber
            ? normalizeKenyanPhone(editForm.phoneNumber)
            : undefined,
          roleCodes: editForm.roleCodes,
        }),
      });

      setEditForm(null);
      showToast('User updated successfully.', 'success');
      await loadData(search);
      await refresh();
    } catch (requestError) {
      const typedError = requestError as ApiError;
      showToast(typedError.message, 'error');
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async (userId: string) => {
    setDeletingUserId(userId);

    try {
      await apiRequest(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      });
      showToast('User deleted successfully.', 'success');
      await loadData(search);
      await refresh();
    } catch (requestError) {
      const typedError = requestError as ApiError;
      showToast(typedError.message, 'error');
    } finally {
      setDeletingUserId(null);
      setConfirmDeleteUserId(null);
    }
  };

  if (!can(permissionCodes.usersRead) && !loading) {
    return (
      <section>
        <h1 className="text-2xl font-semibold text-(--color-primary)">User Management</h1>
        <p className="mt-1 text-sm text-(--color-primary)/70">
          You do not have permission to view users.
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-(--color-primary)">User Management</h1>
          <p className="mt-1 text-sm text-(--color-primary)/70">
            Super admins can create users, assign roles, and manage account status.
          </p>
        </div>
        {can(permissionCodes.usersCreate) ? (
          <button
            type="button"
            onClick={() => setCreateOpen((value) => !value)}
            className="rounded-xl bg-(--color-primary) px-4 py-2 text-sm font-medium text-white transition hover:bg-(--color-primary)/90"
          >
            {createOpen ? 'Close form' : 'Create user'}
          </button>
        ) : null}
      </div>

      {createOpen ? (
        <div className="mt-4 rounded-xl border border-(--color-primary)/18 bg-(--color-surface) p-4">
          <h2 className="text-lg font-semibold text-(--color-primary)">Create User</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <input
              placeholder="Full name"
              value={createForm.name}
              onChange={(event) =>
                setCreateForm((state) => ({ ...state, name: event.target.value }))
              }
              className="rounded-lg border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            />
            <input
              type="email"
              placeholder="Email"
              value={createForm.email}
              onChange={(event) =>
                setCreateForm((state) => ({ ...state, email: event.target.value }))
              }
              className="rounded-lg border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            />
            <div className="relative">
              <input
                type={showCreatePassword ? 'text' : 'password'}
                placeholder="Temporary password"
                value={createForm.password}
                onChange={(event) =>
                  setCreateForm((state) => ({ ...state, password: event.target.value }))
                }
                className="w-full rounded-lg border border-(--color-primary)/25 px-3 py-2 pr-10 text-sm outline-none focus:border-(--color-primary)"
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
              placeholder="Phone number"
              value={createForm.phoneNumber}
              onChange={(event) =>
                setCreateForm((state) => ({ ...state, phoneNumber: event.target.value }))
              }
              className="rounded-lg border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            />
            <select
              value={createForm.userType}
              onChange={(event) =>
                setCreateForm((state) => ({
                  ...state,
                  userType: event.target.value as UserFormState['userType'],
                }))
              }
              className="rounded-lg border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            >
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
            <select
              value={createForm.status}
              onChange={(event) =>
                setCreateForm((state) => ({
                  ...state,
                  status: event.target.value as UserFormState['status'],
                }))
              }
              className="rounded-lg border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          <div className="mt-3">
            <p className="mb-2 text-sm font-medium text-(--color-primary)/85">Roles</p>
            <div className="grid gap-2 md:grid-cols-2">
              {roles.map((role) => (
                <label
                  key={role.id}
                  className="inline-flex items-center gap-2 rounded-md border border-(--color-primary)/15 bg-white px-3 py-2 text-sm text-(--color-primary)/85"
                >
                  <input
                    type="checkbox"
                    checked={createForm.roleCodes.includes(role.code)}
                    onChange={() =>
                      handleToggleRole(createForm.roleCodes, role.code, (nextCodes) =>
                        setCreateForm((state) => ({ ...state, roleCodes: nextCodes })),
                      )
                    }
                    className="size-4 rounded border-(--color-primary)/35"
                  />
                  <span>{role.name}</span>
                </label>
              ))}
            </div>
          </div>

          <p className="mt-2 text-xs text-(--color-primary)/65">
            Phone format: `07XXXXXXXX`, `01XXXXXXXX`, or `+2547XXXXXXXX`.
          </p>

          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="mt-4 rounded-lg bg-(--color-primary) px-4 py-2 text-sm font-medium text-white transition hover:bg-(--color-primary)/90 disabled:opacity-60"
          >
            {creating ? 'Creating...' : 'Create user'}
          </button>
        </div>
      ) : null}

      <div className="mt-4">
        <input
          placeholder="Search users by name..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-full max-w-85 rounded-lg border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
        />
      </div>

      {loading ? <p className="mt-4 text-sm text-(--color-primary)/70">Loading users...</p> : null}
      {error ? <p className="mt-4 text-sm text-(--color-primary)">{error}</p> : null}

      {!loading && !error ? (
        <div className="mt-4 overflow-x-auto rounded-xl border border-(--color-primary)/15">
          <table className="min-w-full bg-white text-left text-sm">
            <thead className="bg-(--color-cream)/60 text-xs uppercase tracking-wide text-(--color-primary)/55">
              <tr>
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">Email</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Roles</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-(--color-primary)/10">
                  <td className="px-3 py-3">
                    <p className="font-medium text-(--color-primary)">{user.name}</p>
                    <p className="text-xs text-(--color-primary)/60">{user.profile?.department || 'No department'}</p>
                  </td>
                  <td className="px-3 py-3 text-(--color-primary)/80">{user.email}</td>
                  <td className="px-3 py-3 text-(--color-primary)/80">{user.userType}</td>
                  <td className="px-3 py-3 text-(--color-primary)/80">{user.status}</td>
                  <td className="px-3 py-3 text-(--color-primary)/80">
                    {user.roles.length > 0 ? user.roles.map((role) => role.name).join(', ') : 'None'}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      {can(permissionCodes.usersUpdate) ? (
                        <button
                          type="button"
                          onClick={() =>
                            setEditForm({
                              id: user.id,
                              name: user.name,
                              userType: user.userType,
                              status: user.status,
                              phoneNumber: user.phoneNumber ?? '',
                              roleCodes: user.roles.map((role) => role.code),
                            })
                          }
                          title="Edit user"
                          aria-label="Edit user"
                          className="btn-edit inline-flex items-center justify-center p-1.5"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      ) : null}
                      {can(permissionCodes.usersDelete) ? (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteUserId(user.id)}
                          disabled={deletingUserId === user.id}
                          title="Delete user"
                          aria-label="Delete user"
                          className="btn-delete inline-flex items-center justify-center p-1.5 disabled:opacity-60"
                        >
                          {deletingUserId === user.id ? (
                            <span className="px-1 text-[10px]">...</span>
                          ) : (
                            <Trash2 className="size-3.5" />
                          )}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {editForm ? (
        <div className="mt-4 rounded-xl border border-(--color-primary)/18 bg-(--color-surface) p-4">
          <h2 className="text-lg font-semibold text-(--color-primary)">Edit User</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <input
              placeholder="Full name"
              value={editForm.name}
              onChange={(event) =>
                setEditForm((state) => (state ? { ...state, name: event.target.value } : state))
              }
              className="rounded-lg border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            />
            <input
              type="tel"
              placeholder="Phone number"
              value={editForm.phoneNumber}
              onChange={(event) =>
                setEditForm((state) =>
                  state ? { ...state, phoneNumber: event.target.value } : state,
                )
              }
              className="rounded-lg border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            />
            <select
              value={editForm.userType}
              onChange={(event) =>
                setEditForm((state) =>
                  state
                    ? { ...state, userType: event.target.value as EditFormState['userType'] }
                    : state,
                )
              }
              className="rounded-lg border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            >
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
            <select
              value={editForm.status}
              onChange={(event) =>
                setEditForm((state) =>
                  state
                    ? { ...state, status: event.target.value as EditFormState['status'] }
                    : state,
                )
              }
              className="rounded-lg border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          {can(permissionCodes.rolesAssign) ? (
            <div className="mt-3">
              <p className="mb-2 text-sm font-medium text-(--color-primary)/85">Roles</p>
              <div className="grid gap-2 md:grid-cols-2">
                {roles.map((role) => (
                  <label
                    key={role.id}
                    className="inline-flex items-center gap-2 rounded-md border border-(--color-primary)/15 bg-white px-3 py-2 text-sm text-(--color-primary)/85"
                  >
                    <input
                      type="checkbox"
                      checked={editForm.roleCodes.includes(role.code)}
                      onChange={() =>
                        handleToggleRole(editForm.roleCodes, role.code, (nextCodes) =>
                          setEditForm((state) =>
                            state ? { ...state, roleCodes: nextCodes } : state,
                          ),
                        )
                      }
                      className="size-4 rounded border-(--color-primary)/35"
                    />
                    <span>{role.name}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleUpdate}
                disabled={updating}
                className="rounded-lg bg-(--color-primary) px-4 py-2 text-sm font-medium text-white transition hover:bg-(--color-primary)/90 disabled:opacity-60"
              >
              {updating ? 'Updating...' : 'Save changes'}
            </button>
            <button
              type="button"
              onClick={() => setEditForm(null)}
              className="rounded-lg border border-(--color-primary)/30 px-4 py-2 text-sm text-(--color-primary)/80 hover:bg-(--color-cream)"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={Boolean(confirmDeleteUserId)}
        title="Delete User"
        description="This action is permanent. Do you want to delete this user?"
        confirmLabel="Delete user"
        destructive
        loading={Boolean(confirmDeleteUserId && deletingUserId === confirmDeleteUserId)}
        onCancel={() => setConfirmDeleteUserId(null)}
        onConfirm={() => {
          if (confirmDeleteUserId) {
            void handleDelete(confirmDeleteUserId);
          }
        }}
      />
    </section>
  );
};

export default UsersManagementPage;
