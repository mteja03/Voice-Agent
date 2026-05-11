import { useCallback, useEffect, useState } from 'react';
import { Building2, Loader2, Shield, UserPlus } from 'lucide-react';
import { listUsers, createUser, updateUser } from '../services/usersApi';
import { getAuthUser } from '../services/authSession';

export default function UserManagement({
  activeCompanyId,
  tenants = [],
  isMasterAdmin = false,
  tenantsLoading = false,
}) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [savingId, setSavingId] = useState('');
  const [adding, setAdding] = useState(false);

  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('agent');

  const [manageCompanyId, setManageCompanyId] = useState(activeCompanyId || '');

  useEffect(() => {
    if (!isMasterAdmin || tenants.length === 0) return;
    setManageCompanyId((prev) => {
      const valid = prev && tenants.some((t) => t.id === prev);
      if (valid) return prev;
      const fallback =
        activeCompanyId && tenants.some((t) => t.id === activeCompanyId)
          ? activeCompanyId
          : tenants[0].id;
      return fallback;
    });
  }, [tenants, isMasterAdmin, activeCompanyId]);

  const scopeId = isMasterAdmin ? manageCompanyId : activeCompanyId;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await listUsers(isMasterAdmin ? scopeId : undefined);
      setUsers(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e.message || 'Failed to load team');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [isMasterAdmin, scopeId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setFormError('');
    setAdding(true);
    try {
      const user = await createUser({
        email: newEmail.trim(),
        password: newPassword,
        role: newRole,
        companyId: isMasterAdmin ? manageCompanyId : undefined,
      });
      setUsers((prev) => [...prev, user].sort((a, b) => a.email.localeCompare(b.email)));
      setNewEmail('');
      setNewPassword('');
      setNewRole('agent');
    } catch (err) {
      setFormError(err.message || 'Could not add user');
    } finally {
      setAdding(false);
    }
  };

  const patchUser = async (userId, patch) => {
    setSavingId(userId);
    setError('');
    try {
      const updated = await updateUser(userId, patch, isMasterAdmin ? scopeId : undefined);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...updated } : u)));
    } catch (e) {
      setError(e.message || 'Update failed');
    } finally {
      setSavingId('');
    }
  };

  const currentId = getAuthUser()?.id;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto p-6 lg:p-8">
      <div className="surface-card rounded-2xl border border-slate-200/80 p-6 shadow-sm dark:border-gray-700/80">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
            <Shield className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Grant access</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-gray-400">
              Admins manage campaigns and team; agents use the dialer. Share initial passwords through a secure channel.
            </p>
          </div>
        </div>

        <form onSubmit={handleAdd} className="flex flex-col gap-4 border-t border-slate-200/70 pt-6 dark:border-gray-700/80">
          {isMasterAdmin && (
            <div className="flex flex-col gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-gray-700/80 dark:bg-gray-900/40">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-gray-300">
                  <Building2 className="h-4 w-4 text-brand-600 dark:text-brand-400" aria-hidden />
                  Workspace for this list and new members
                </span>
                <select
                  value={manageCompanyId}
                  onChange={(ev) => setManageCompanyId(ev.target.value)}
                  disabled={tenantsLoading || tenants.length === 0}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-950"
                  aria-label="Workspace for team management"
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-slate-500 dark:text-gray-500">
                Members only see data for their workspace. You can pick an org here without changing the header switcher.
              </p>
            </div>
          )}

          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-500">
            Add member
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-slate-600 dark:text-gray-400">Email</span>
              <input
                type="email"
                required
                autoComplete="off"
                value={newEmail}
                onChange={(ev) => setNewEmail(ev.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-950"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-slate-600 dark:text-gray-400">Initial password</span>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={newPassword}
                onChange={(ev) => setNewPassword(ev.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-950"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-slate-600 dark:text-gray-400">Role</span>
              <select
                value={newRole}
                onChange={(ev) => setNewRole(ev.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-950"
              >
                <option value="agent">Agent</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={adding}
                className="inline-flex h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-500 disabled:opacity-50 sm:w-auto"
              >
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Add user
              </button>
            </div>
          </div>
          {formError && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {formError}
            </p>
          )}
        </form>
      </div>

      <div className="surface-card min-h-0 flex-1 rounded-2xl border border-slate-200/80 shadow-sm dark:border-gray-700/80">
        <div className="border-b border-slate-200/70 px-6 py-4 dark:border-gray-700/80">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Workspace members</h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading…
          </div>
        ) : error && !users.length ? (
          <p className="px-6 py-10 text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200/70 text-xs uppercase tracking-wide text-slate-500 dark:border-gray-700 dark:text-gray-500">
                  <th className="px-6 py-3 font-medium">Email</th>
                  <th className="px-6 py-3 font-medium">Role</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Platform</th>
                  <th className="px-6 py-3 font-medium w-40" />
                </tr>
              </thead>
              <tbody>
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-sm text-slate-500 dark:text-gray-500">
                      No members in this workspace yet. Add someone above.
                    </td>
                  </tr>
                )}
                {users.map((u) => {
                  const isSelf = u.id === currentId;
                  const busy = savingId === u.id;
                  return (
                    <tr
                      key={u.id}
                      className="border-b border-slate-100 dark:border-gray-800/80 last:border-0"
                    >
                      <td className="px-6 py-3 font-medium text-slate-900 dark:text-gray-100">{u.email}</td>
                      <td className="px-6 py-3">
                        <select
                          disabled={busy || isSelf || u.isPlatformAdmin}
                          value={u.role}
                          onChange={(ev) => patchUser(u.id, { role: ev.target.value })}
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs disabled:opacity-50 dark:border-gray-600 dark:bg-gray-950"
                        >
                          <option value="agent">Agent</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="px-6 py-3">
                        <label className="inline-flex cursor-pointer items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={u.isActive}
                            disabled={busy || isSelf || u.isPlatformAdmin}
                            onChange={(ev) => patchUser(u.id, { isActive: ev.target.checked })}
                            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 disabled:opacity-50"
                          />
                          <span>{u.isActive ? 'Active' : 'Inactive'}</span>
                        </label>
                      </td>
                      <td className="px-6 py-3 text-slate-600 dark:text-gray-400">
                        {u.isPlatformAdmin ? 'Platform admin' : '—'}
                      </td>
                      <td className="px-6 py-3 text-right text-xs text-slate-400">
                        {busy ? <Loader2 className="ml-auto h-4 w-4 animate-spin text-brand-500" /> : null}
                        {isSelf ? <span className="text-slate-500">You</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {error && users.length > 0 && (
          <p className="border-t border-slate-200/70 px-6 py-3 text-sm text-red-600 dark:text-red-400 dark:border-gray-700">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
