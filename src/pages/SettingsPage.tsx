import { useEffect, useMemo, useState } from 'react';
import { Shield, UserRound } from 'lucide-react';
import { useAuthz } from '../contexts/AuthzContext';
import { useToast } from '../contexts/ToastContext';
import type { ApiError } from '../lib/api';
import { apiRequest } from '../lib/api';
import { permissionCodes } from '../lib/permissions';

type Role = {
  id: string;
  name: string;
  code: string;
  description: string | null;
};

type UserRole = {
  id: string;
  name: string;
  code: string;
  description: string | null;
};

type AdminUser = {
  id: string;
  name: string;
  email: string;
  roles: UserRole[];
  permissions: string[];
  status: 'active' | 'inactive' | 'suspended';
  userType: 'admin' | 'staff';
};

type UsersListItem = {
  id: string;
  name: string;
  email: string;
  status: 'active' | 'inactive' | 'suspended';
  userType: 'admin' | 'staff';
  roles: UserRole[];
};

const SettingsPage = () => {
  const { can, isSuperAdmin } = useAuthz();
  const { showToast } = useToast();

  const canReadUsers = can(permissionCodes.usersRead);
  const canAssignRoles = can(permissionCodes.rolesAssign);

  const [users, setUsers] = useState<UsersListItem[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [draftRoleCodes, setDraftRoleCodes] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const toApiError = (error: unknown) => error as ApiError;

  const groupedPermissions = useMemo(() => {
    const permissions = selectedUser?.permissions ?? [];
    const grouped = permissions.reduce<Record<string, string[]>>((acc, permission) => {
      const [resource, action] = permission.split('.');
      if (!resource || !action) return acc;
      if (!acc[resource]) acc[resource] = [];
      acc[resource].push(action);
      return acc;
    }, {});

    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [selectedUser]);

  const loadSettingsData = async () => {
    if (!canReadUsers) return;

    setLoading(true);
    try {
      const [usersResponse, rolesResponse] = await Promise.all([
        apiRequest<{ data: UsersListItem[] }>('/api/admin/users'),
        apiRequest<{ data: Role[] }>('/api/admin/roles'),
      ]);
      setUsers(usersResponse.data);
      setRoles(rolesResponse.data);

      if (!selectedUserId && usersResponse.data.length > 0) {
        setSelectedUserId(usersResponse.data[0].id);
      }
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadSelectedUser = async (userId: string) => {
    if (!userId) return;

    try {
      const response = await apiRequest<{ data: AdminUser }>(
        `/api/admin/users/${encodeURIComponent(userId)}`,
      );
      setSelectedUser(response.data);
      setDraftRoleCodes(response.data.roles.map((role) => role.code));
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    }
  };

  useEffect(() => {
    void loadSettingsData();
  }, [canReadUsers]);

  useEffect(() => {
    if (!selectedUserId) return;
    void loadSelectedUser(selectedUserId);
  }, [selectedUserId]);

  const toggleRole = (roleCode: string) => {
    setDraftRoleCodes((prev) =>
      prev.includes(roleCode) ? prev.filter((code) => code !== roleCode) : [...prev, roleCode],
    );
  };

  const saveRoleAssignments = async () => {
    if (!selectedUserId) return;

    setSaving(true);
    try {
      await apiRequest(`/api/admin/users/${encodeURIComponent(selectedUserId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          roleCodes: draftRoleCodes,
        }),
      });
      showToast('Role assignments updated.', 'success');
      await Promise.all([loadSettingsData(), loadSelectedUser(selectedUserId)]);
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!canReadUsers) {
    return (
      <section>
        <h1 className="text-2xl font-semibold text-(--color-primary)">Settings</h1>
        <p className="mt-1 text-sm text-(--color-primary)/70">
          You do not have permission to view permission settings.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-(--color-primary)">Settings</h1>
        <p className="mt-1 text-sm text-(--color-primary)/70">
          Super admin permission management: assign roles and inspect effective user permissions.
        </p>
      </div>

      {!isSuperAdmin ? (
        <div className="rounded-xl border border-(--color-primary)/20 bg-(--color-surface) p-4 text-sm text-(--color-primary)/80">
          Only super admin accounts can update role assignments.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-xl border border-(--color-primary)/20 bg-(--color-surface) p-3">
          <h2 className="mb-2 text-sm font-semibold text-(--color-primary)">Users</h2>
          {loading ? <p className="text-sm text-(--color-primary)/70">Loading...</p> : null}
          <div className="max-h-[65vh] overflow-auto">
            {users.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => setSelectedUserId(user.id)}
                className={`mb-2 block w-full rounded-md border px-3 py-2 text-left ${
                  selectedUserId === user.id
                    ? 'border-(--color-primary) bg-(--color-cream)'
                    : 'border-(--color-primary)/15 bg-white'
                }`}
              >
                <p className="text-sm font-medium text-(--color-primary)">{user.name}</p>
                <p className="text-xs text-(--color-primary)/65">{user.email}</p>
              </button>
            ))}
          </div>
        </aside>

        <div className="rounded-xl border border-(--color-primary)/20 bg-(--color-surface) p-4">
          {!selectedUser ? (
            <p className="text-sm text-(--color-primary)/70">Select a user to manage permissions.</p>
          ) : (
            <div className="space-y-4">
              <header className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-(--color-primary)">
                    {selectedUser.name}
                  </h2>
                  <p className="text-sm text-(--color-primary)/70">
                    {selectedUser.email} • {selectedUser.userType} • {selectedUser.status}
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-lg bg-(--color-cream) px-3 py-1.5 text-xs text-(--color-primary)/80">
                  <Shield className="size-4" />
                  Role Based Access Control
                </div>
              </header>

              <section className="rounded-lg border border-(--color-primary)/15 p-3">
                <h3 className="mb-2 text-sm font-semibold text-(--color-primary)">Assigned Roles</h3>
                <div className="grid gap-2 md:grid-cols-2">
                  {roles.map((role) => (
                    <label
                      key={role.id}
                      className="inline-flex items-center gap-2 rounded-md border border-(--color-primary)/15 bg-white px-3 py-2 text-sm text-(--color-primary)/85"
                    >
                      <input
                        type="checkbox"
                        checked={draftRoleCodes.includes(role.code)}
                        onChange={() => toggleRole(role.code)}
                        disabled={!isSuperAdmin || !canAssignRoles || saving}
                        className="size-4 rounded border-(--color-primary)/35"
                      />
                      <span>{role.name}</span>
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => void saveRoleAssignments()}
                  disabled={!isSuperAdmin || !canAssignRoles || saving}
                  className="mt-3 rounded-md bg-(--color-primary) px-3.5 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save role assignments'}
                </button>
              </section>

              <section className="rounded-lg border border-(--color-primary)/15 p-3">
                <h3 className="mb-2 text-sm font-semibold text-(--color-primary)">
                  Effective Permissions
                </h3>
                {groupedPermissions.length === 0 ? (
                  <p className="text-sm text-(--color-primary)/70">No permissions assigned.</p>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2">
                    {groupedPermissions.map(([resource, actions]) => (
                      <div
                        key={resource}
                        className="rounded-md border border-(--color-primary)/12 bg-white px-3 py-2"
                      >
                        <p className="text-sm font-medium capitalize text-(--color-primary)">{resource}</p>
                        <p className="mt-1 text-xs text-(--color-primary)/70">{actions.join(', ')}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-lg border border-(--color-primary)/15 p-3">
                <h3 className="mb-2 text-sm font-semibold text-(--color-primary)">Current Roles</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedUser.roles.length > 0 ? (
                    selectedUser.roles.map((role) => (
                      <span
                        key={role.id}
                        className="inline-flex items-center gap-1 rounded-full bg-(--color-cream) px-2.5 py-1 text-xs text-(--color-primary)/85"
                      >
                        <UserRound className="size-3.5" />
                        {role.name}
                      </span>
                    ))
                  ) : (
                    <p className="text-sm text-(--color-primary)/70">No roles assigned.</p>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default SettingsPage;
