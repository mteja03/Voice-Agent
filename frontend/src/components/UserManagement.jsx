import { useCallback, useEffect, useState } from 'react';
import { Building2, Loader2, Shield, UserPlus, Users, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { listUsers, createUser, updateUser } from '../services/usersApi';
import { getAuthUser } from '../services/authSession';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(email = '') {
  const local = email.split('@')[0];
  const parts = local.split(/[._\-+]/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return local.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-purple-500', 'bg-emerald-500',
  'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500',
];

function avatarColor(email = '') {
  const hash = email.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

const inputCls =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-950 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-brand-400 transition-colors';

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ email, size = 'md' }) {
  const sizeClass = size === 'sm' ? 'w-7 h-7 text-[11px]' : 'w-9 h-9 text-xs';
  return (
    <div className={`${sizeClass} ${avatarColor(email)} rounded-full flex items-center justify-center font-semibold text-white shrink-0`}>
      {getInitials(email)}
    </div>
  );
}

// ─── Role badge ───────────────────────────────────────────────────────────────
function RoleBadge({ role }) {
  if (role === 'admin') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 border border-brand-200/70 dark:bg-brand-900/30 dark:text-brand-300 dark:border-brand-700/40">
        <Shield className="w-3 h-3" />
        Admin
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700">
      <Users className="w-3 h-3" />
      Agent
    </span>
  );
}

// ─── Toggle switch ────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      } ${checked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-gray-700'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4.5' : 'translate-x-0.5'}`}
        style={{ transform: checked ? 'translateX(18px)' : 'translateX(2px)' }}
      />
    </button>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ toast, onDismiss }) {
  const isError = toast.tone === 'error';
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl max-w-sm animate-slide-up ${
      isError
        ? 'bg-red-50 text-red-900 border-red-200 dark:bg-red-950/90 dark:text-red-200 dark:border-red-800/60'
        : 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/90 dark:text-emerald-200 dark:border-emerald-800/60'
    }`}>
      {isError ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
      <span className="text-sm font-medium flex-1">{toast.message}</span>
      <button onClick={onDismiss} className="shrink-0 p-0.5 opacity-60 hover:opacity-100 transition-opacity">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
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
  const [toasts, setToasts] = useState([]);
  const toastId = { current: 1 };

  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('agent');
  const [manageCompanyId, setManageCompanyId] = useState(activeCompanyId || '');

  const pushToast = (message, tone = 'success') => {
    const id = toastId.current++;
    setToasts(prev => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  };

  useEffect(() => {
    if (!isMasterAdmin || tenants.length === 0) return;
    setManageCompanyId(prev => {
      const valid = prev && tenants.some(t => t.id === prev);
      if (valid) return prev;
      return activeCompanyId && tenants.some(t => t.id === activeCompanyId)
        ? activeCompanyId
        : tenants[0].id;
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

  useEffect(() => { load(); }, [load]);

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
      setUsers(prev => [...prev, user].sort((a, b) => a.email.localeCompare(b.email)));
      setNewEmail('');
      setNewPassword('');
      setNewRole('agent');
      pushToast(`${newEmail.trim()} added successfully`);
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
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...updated } : u));
      pushToast('Member updated');
    } catch (e) {
      pushToast(e.message || 'Update failed', 'error');
    } finally {
      setSavingId('');
    }
  };

  const currentId = getAuthUser()?.id;
  const activeCount = users.filter(u => u.isActive).length;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-6 overflow-auto p-6 lg:p-8">

      {/* Page header */}
      <header className="animate-slide-up" style={{ animationDelay: '300ms' }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Team</h1>
            <p className="text-sm text-slate-600 dark:text-gray-400 mt-1">
              Manage workspace members and their access levels.
            </p>
          </div>
          {!loading && users.length > 0 && (
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{users.length}</p>
                <p className="text-xs text-slate-500 dark:text-gray-500">member{users.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{activeCount}</p>
                <p className="text-xs text-slate-500 dark:text-gray-500">active</p>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Add member card */}
      <div className="surface-card rounded-2xl border border-slate-200/80 p-6 shadow-sm dark:border-gray-700/80 animate-slide-up" style={{ animationDelay: '400ms' }}>
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
            <Shield className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Grant access</h2>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-gray-400">
              Admins manage campaigns and settings; agents use the dialer. Share initial passwords through a secure channel.
            </p>
          </div>
        </div>

        <form onSubmit={handleAdd} className="space-y-4 border-t border-slate-200/70 pt-5 dark:border-gray-700/80">
          {/* Workspace picker (master admin only) */}
          {isMasterAdmin && (
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-gray-700/80 dark:bg-gray-900/40">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-gray-300">
                  <Building2 className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                  Workspace
                </span>
                <select
                  value={manageCompanyId}
                  onChange={ev => setManageCompanyId(ev.target.value)}
                  disabled={tenantsLoading || tenants.length === 0}
                  className={inputCls}
                  aria-label="Workspace for team management"
                >
                  {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-gray-500">
                Members only see data for their own workspace.
              </p>
            </div>
          )}

          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-500">New member</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-600 dark:text-gray-400">Email</label>
              <input
                type="email"
                required
                autoComplete="off"
                value={newEmail}
                onChange={ev => setNewEmail(ev.target.value)}
                placeholder="name@company.com"
                className={inputCls}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-600 dark:text-gray-400">Initial password</label>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={newPassword}
                onChange={ev => setNewPassword(ev.target.value)}
                placeholder="Min. 6 characters"
                className={inputCls}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-600 dark:text-gray-400">Role</label>
              <select value={newRole} onChange={ev => setNewRole(ev.target.value)} className={inputCls}>
                <option value="agent">Agent — dialer access</option>
                <option value="admin">Admin — full access</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={adding}
                className="w-full inline-flex h-[42px] items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-500 disabled:opacity-50"
              >
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Add member
              </button>
            </div>
          </div>
          {formError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 px-3 py-2.5 text-sm text-red-700 dark:text-red-300" role="alert">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {formError}
            </div>
          )}
        </form>
      </div>

      {/* Members table */}
      <div className="surface-card min-h-0 flex-1 rounded-2xl border border-slate-200/80 shadow-sm dark:border-gray-700/80 overflow-hidden animate-slide-up" style={{ animationDelay: '500ms' }}>
        <div className="border-b border-slate-200/70 px-6 py-4 dark:border-gray-700/80 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Workspace members</h3>
          {!loading && users.length > 0 && (
            <span className="text-xs text-slate-500 dark:text-gray-500">{users.length} total</span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-500 dark:text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading members…</span>
          </div>
        ) : error && !users.length ? (
          <div className="flex items-center gap-2 px-6 py-10 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-gray-800 flex items-center justify-center">
              <Users className="w-7 h-7 text-slate-400 dark:text-gray-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">No members yet</p>
              <p className="text-xs text-slate-500 dark:text-gray-500 mt-0.5">Add someone using the form above.</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200/70 dark:border-gray-700 text-[11px] uppercase tracking-wide text-slate-500 dark:text-gray-500">
                  <th className="px-6 py-3 font-semibold">Member</th>
                  <th className="px-6 py-3 font-semibold">Role</th>
                  <th className="px-6 py-3 font-semibold">Active</th>
                  <th className="px-6 py-3 font-semibold">Platform</th>
                  <th className="px-4 py-3 font-semibold w-12 text-right" />
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const isSelf = u.id === currentId;
                  const busy = savingId === u.id;
                  const canEdit = !busy && !isSelf && !u.isPlatformAdmin;
                  return (
                    <tr
                      key={u.id}
                      className="border-b border-slate-100 dark:border-gray-800/80 last:border-0 hover:bg-slate-50/60 dark:hover:bg-gray-800/30 transition-colors"
                    >
                      {/* Member column */}
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar email={u.email} />
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 dark:text-gray-100 truncate">{u.email}</p>
                            {isSelf && (
                              <p className="text-[11px] text-slate-500 dark:text-gray-500">You</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Role column */}
                      <td className="px-6 py-3.5">
                        {canEdit ? (
                          <select
                            value={u.role}
                            onChange={ev => patchUser(u.id, { role: ev.target.value })}
                            className="rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-xs text-slate-700 dark:text-gray-300 focus:outline-none focus:border-brand-500 cursor-pointer"
                          >
                            <option value="agent">Agent</option>
                            <option value="admin">Admin</option>
                          </select>
                        ) : (
                          <RoleBadge role={u.role} />
                        )}
                      </td>

                      {/* Active column */}
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2">
                          <Toggle
                            checked={u.isActive}
                            disabled={!canEdit}
                            onChange={val => patchUser(u.id, { isActive: val })}
                          />
                          <span className={`text-xs ${u.isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-gray-600'}`}>
                            {u.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </td>

                      {/* Platform column */}
                      <td className="px-6 py-3.5 text-xs text-slate-500 dark:text-gray-500">
                        {u.isPlatformAdmin ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-700/40 text-[11px] font-medium">
                            <Shield className="w-3 h-3" />
                            Platform
                          </span>
                        ) : '—'}
                      </td>

                      {/* Actions / spinner */}
                      <td className="px-4 py-3.5 text-right">
                        {busy && <Loader2 className="ml-auto h-4 w-4 animate-spin text-brand-500" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {error && users.length > 0 && (
          <div className="flex items-center gap-2 border-t border-slate-200/70 dark:border-gray-700 px-6 py-3 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Toasts */}
      <div className="fixed bottom-6 right-6 z-50 space-y-3">
        {toasts.map(toast => (
          <Toast
            key={toast.id}
            toast={toast}
            onDismiss={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
          />
        ))}
      </div>
    </div>
  );
}
