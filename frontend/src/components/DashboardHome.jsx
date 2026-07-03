import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users,
  PhoneCall,
  CheckCircle2,
  TrendingUp,
  Clock,
  Activity,
  BarChart3,
  Phone,
  Search,
  RefreshCw,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { apiFetch, BACKEND_URL } from '../services/apiFetch';
import { listRecentCalls } from '../services/callsApi';
import { useTheme } from '../context/ThemeContext';
import { Skeleton } from './ui/Skeleton';
import CallRecordingPair from './CallRecordingPair';

const PIE_COLORS = ['#c346ef', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#6b7280'];

const STROKE = {
  blue: '#3b82f6',
  emerald: '#10b981',
  brand: '#c346ef',
  indigo: '#6366f1',
  amber: '#f59e0b',
};

function MiniSparkline({ points, stroke }) {
  const raw = points?.length ? points : [0];
  const max = Math.max(...raw, 1);
  const data = raw.map((y, i) => ({ i, y: (y / max) * 100 }));
  return (
    <div className="mt-3 h-9 w-full opacity-90" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <Area
            type="monotone"
            dataKey="y"
            stroke={stroke}
            fill={stroke}
            fillOpacity={0.12}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function buildSparkFromCalls(callsByDate, scale = 1) {
  if (!callsByDate?.length) return null;
  return callsByDate.map((d) => (Number(d.count) || 0) * scale);
}

function repeatSpark(value, len = 7) {
  const v = Number(value) || 0;
  return Array.from({ length: len }, () => v);
}

function DashboardSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-100 text-slate-800 dark:bg-gray-950 dark:text-gray-200">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/70 px-6 py-5 backdrop-blur dark:border-gray-800/60 dark:bg-gray-900/30 sm:px-8 sm:py-6">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-8 w-56 max-w-full" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <Skeleton className="h-9 w-24 shrink-0" />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="space-y-3 rounded-2xl border border-slate-200/90 bg-white/90 p-6 dark:border-gray-800/60 dark:bg-gray-900/50"
            >
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
        <div className="mx-auto mt-8 grid max-w-7xl grid-cols-1 gap-6 lg:grid-cols-3">
          <Skeleton className="h-[320px] rounded-2xl lg:col-span-2" />
          <Skeleton className="h-[320px] rounded-2xl" />
        </div>
        <div className="mx-auto mt-8 grid max-w-7xl grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

function formatCallWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function DashboardHome({ leads, activeCampaignName, onNavigateCampaigns, onNavigateDialer }) {
  const { theme } = useTheme();
  const [analytics, setAnalytics] = useState(null);
  const [recentCalls, setRecentCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [recordingsFilter, setRecordingsFilter] = useState('all');
  const [recordingsSearch, setRecordingsSearch] = useState('');
  const [recordingsLoading, setRecordingsLoading] = useState(false);

  const chartUi = useMemo(() => {
    const isDark = theme === 'dark';
    return {
      gridStroke: isDark ? '#374151' : '#e2e8f0',
      axisStroke: isDark ? '#9ca3af' : '#64748b',
      tooltipStyle: isDark
        ? { backgroundColor: '#111827', borderColor: '#374151', borderRadius: '0.75rem', color: '#f3f4f6' }
        : { backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '0.75rem', color: '#0f172a' },
    };
  }, [theme]);

  const loadDashboard = useCallback(async (setInitialLoading = false) => {
    if (setInitialLoading) setLoading(true);
    else setRecordingsLoading(true);
    setFetchError(null);
    try {
      const [analyticsData, callsRows] = await Promise.all([
        apiFetch(`${BACKEND_URL}/api/analytics`),
        listRecentCalls(20).catch(() => []),
      ]);
      setAnalytics(analyticsData);
      setRecentCalls(Array.isArray(callsRows) ? callsRows : []);
      setFetchedAt(new Date());
    } catch (err) {
      console.error('Failed to fetch analytics', err);
      setFetchError(err?.message || 'Failed to load analytics');
      // On a refresh, keep any previously loaded data so the dashboard
      // doesn't blank out just because a background refresh failed.
      if (setInitialLoading) {
        setAnalytics(null);
        setRecentCalls([]);
      }
    } finally {
      if (setInitialLoading) setLoading(false);
      else setRecordingsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [analyticsData, callsRows] = await Promise.all([
          apiFetch(`${BACKEND_URL}/api/analytics`),
          listRecentCalls(20).catch(() => []),
        ]);
        if (cancelled) return;
        setAnalytics(analyticsData);
        setRecentCalls(Array.isArray(callsRows) ? callsRows : []);
        setFetchedAt(new Date());
        setFetchError(null);
      } catch (err) {
        console.error('Failed to fetch analytics', err);
        if (!cancelled) {
          setAnalytics(null);
          setRecentCalls([]);
          setFetchError(err?.message || 'Failed to load analytics');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalLeads = leads.length;
  const contactedLeads = leads.filter((l) => (l.lastOutcome || 'new') !== 'new').length;

  const totalCalls = analytics?.totalCalls || 0;
  const interestedCalls = analytics?.interestedCalls || 0;
  const avgDurationSeconds = analytics?.avgDurationSeconds || 0;
  const conversionRate = totalCalls > 0 ? ((interestedCalls / totalCalls) * 100).toFixed(1) : 0;

  const callsByDate = analytics?.callsByDate || [];
  const outcomes = analytics?.outcomes || [];

  const callsSpark = buildSparkFromCalls(callsByDate, 1);
  const interestedRatio = totalCalls > 0 ? interestedCalls / totalCalls : 0;
  const interestedSpark = buildSparkFromCalls(callsByDate, interestedRatio) || repeatSpark(interestedCalls);
  const conversionSpark = repeatSpark(parseFloat(conversionRate) || 0);
  const durationSpark = repeatSpark(Math.min(100, avgDurationSeconds / 6));
  const campaignSpark =
    totalLeads > 0
      ? Array.from({ length: 7 }, (_, i) => Math.round((contactedLeads * (i + 1)) / 7))
      : repeatSpark(0);

  const updatedLabel = fetchedAt
    ? `Updated ${fetchedAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
    : null;

  const callsWithRecordings = useMemo(
    () => recentCalls.filter((c) => c.recordingUserUrl || c.recordingAgentUrl),
    [recentCalls]
  );

  const filteredRecordingCalls = useMemo(() => {
    const q = recordingsSearch.trim().toLowerCase();
    return callsWithRecordings.filter((c) => {
      if (recordingsFilter !== 'all' && String(c.outcome || 'unknown') !== recordingsFilter) {
        return false;
      }
      if (!q) return true;
      const outcome = String(c.outcome || '').toLowerCase();
      const when = formatCallWhen(c.createdAt).toLowerCase();
      const duration = `${Math.floor((c.duration || 0) / 60)}m ${(c.duration || 0) % 60}s`.toLowerCase();
      return outcome.includes(q) || when.includes(q) || duration.includes(q);
    });
  }, [callsWithRecordings, recordingsFilter, recordingsSearch]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="motion-safe:transition-colors motion-safe:duration-200 flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-100 text-slate-800 dark:bg-gray-950 dark:text-gray-200">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200/80 bg-white/70 px-6 py-5 backdrop-blur dark:border-gray-800/60 dark:bg-gray-900/30 sm:px-8 sm:py-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Dashboard Overview</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-gray-400">
            Global agent performance and lead totals across all campaigns.
            {activeCampaignName ? (
              <span className="mt-1 block text-xs text-slate-500 dark:text-gray-500">
                Dialer is using: <span className="text-slate-800 dark:text-gray-300">{activeCampaignName}</span>
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          {fetchError && (analytics || recentCalls.length > 0) ? (
            <span className="text-xs text-amber-600 dark:text-amber-400">Couldn't refresh — showing last loaded data</span>
          ) : updatedLabel ? (
            <span className="text-xs text-slate-500 dark:text-gray-500">{updatedLabel}</span>
          ) : null}
          <button
            type="button"
            onClick={() => loadDashboard(false)}
            disabled={recordingsLoading}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-brand-600 dark:text-gray-500 dark:hover:text-brand-400 transition-colors disabled:opacity-50"
            title="Refresh dashboard data"
          >
            <Activity className={`h-3.5 w-3.5 text-brand-400 ${recordingsLoading ? 'animate-spin' : ''}`} aria-hidden />
            {fetchedAt ? `Last refreshed ${fetchedAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : 'Refresh'}
          </button>
        </div>
      </header>

      {fetchError && (
        <div role="status" className="mx-4 mt-4 sm:mx-8 flex items-start gap-3 rounded-xl border border-amber-300/60 bg-amber-50/95 px-4 py-3 text-sm text-amber-900 dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-200">
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="font-medium">Analytics couldn't load right now</p>
            <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
              {(analytics || recentCalls.length > 0)
                ? "We're showing the last data we loaded. Try again in a moment."
                : "This is usually a temporary connection hiccup. Try again in a moment."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadDashboard(false)}
            className="shrink-0 rounded-lg border border-amber-300 bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-900/70 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-8 sm:py-8">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Calls Made"
              value={totalCalls}
              icon={PhoneCall}
              trend="All-time"
              color="bg-blue-500"
              spark={callsSpark}
              sparkStroke={STROKE.blue}
            />
            <StatCard
              title="Interested Leads"
              value={interestedCalls}
              icon={CheckCircle2}
              trend="Needs follow-up"
              color="bg-emerald-500"
              spark={interestedSpark}
              sparkStroke={STROKE.emerald}
            />
            <StatCard
              title="Conversion Rate"
              value={`${conversionRate}%`}
              icon={TrendingUp}
              trend="Global average"
              color="bg-brand-500"
              spark={conversionSpark}
              sparkStroke={STROKE.brand}
            />
            <StatCard
              title="Avg Call Duration"
              value={`${Math.floor(avgDurationSeconds / 60)}m ${avgDurationSeconds % 60}s`}
              icon={Clock}
              trend="Across all calls"
              color="bg-indigo-500"
              spark={durationSpark}
              sparkStroke={STROKE.indigo}
            />
            <StatCard
              title="Active Campaign"
              value={`${contactedLeads}/${totalLeads}`}
              icon={Users}
              trend="Leads contacted"
              color="bg-amber-500"
              spark={campaignSpark}
              sparkStroke={STROKE.amber}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="surface-card flex flex-col p-6 lg:col-span-2 animate-slide-up">
              <h2 className="mb-6 text-lg font-semibold text-slate-900 dark:text-white">Call Volume (Last 7 Days)</h2>
              <div className="min-h-[300px] flex-1">
                {callsByDate.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={callsByDate} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#c346ef" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#c346ef" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartUi.gridStroke} vertical={false} />
                      <XAxis dataKey="date" stroke={chartUi.axisStroke} fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke={chartUi.axisStroke} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={chartUi.tooltipStyle} itemStyle={{ color: '#c346ef' }} />
                      <Area
                        type="monotone"
                        dataKey="count"
                        name="Calls"
                        stroke="#c346ef"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorCalls)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyAnalyticsPanel
                    icon={BarChart3}
                    title="No call volume yet"
                    body="Once your team completes calls, a 7-day trend appears here. Start from Campaigns (import leads) then use the Dialer."
                    primaryLabel="Go to Campaigns"
                    onPrimary={onNavigateCampaigns}
                    secondaryLabel="Open Dialer"
                    onSecondary={onNavigateDialer}
                  />
                )}
              </div>
            </div>

            <div className="surface-card flex flex-col p-6 animate-slide-up">
              <h2 className="mb-6 text-lg font-semibold text-slate-900 dark:text-white">Outcome Distribution</h2>
              <div className="min-h-[300px] flex-1">
                {outcomes.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={outcomes}
                        cx="50%"
                        cy="45%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                      >
                        {outcomes.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={chartUi.tooltipStyle}
                        itemStyle={{ color: theme === 'dark' ? '#fff' : '#0f172a' }}
                      />
                      <Legend
                        wrapperStyle={{
                          fontSize: '12px',
                          paddingTop: '20px',
                          color: theme === 'dark' ? '#9ca3af' : '#475569',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyAnalyticsPanel
                    icon={Phone}
                    title="No outcomes to chart"
                    body="When calls are logged with outcomes (interested, follow up, etc.), this breakdown fills in automatically."
                    primaryLabel="Open Dialer"
                    onPrimary={onNavigateDialer}
                    secondaryLabel="Manage campaigns"
                    onSecondary={onNavigateCampaigns}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="surface-card p-6 animate-slide-up">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Call recordings</h2>
              <p className="text-xs text-slate-500 dark:text-gray-500">
                Both tracks are grouped per call. If a recording won't play, use Download or refresh — playback links are time-limited.
              </p>
            </div>
            <div className="mb-3 rounded-xl border border-slate-200/90 bg-white/80 p-3 dark:border-gray-800 dark:bg-gray-900/50">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'interested', label: 'Interested' },
                    { id: 'follow_up', label: 'Follow up' },
                    { id: 'not_interested', label: 'Not interested' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setRecordingsFilter(opt.id)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                        recordingsFilter === opt.id
                          ? 'border-brand-500/50 bg-brand-500/10 text-brand-700 dark:text-brand-300'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-gray-500" />
                    <input
                      value={recordingsSearch}
                      onChange={(e) => setRecordingsSearch(e.target.value)}
                      placeholder="Search recordings"
                      className="w-52 rounded-lg border border-slate-200 bg-white py-1.5 pl-7 pr-2 text-xs text-slate-700 outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => loadDashboard(false)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    disabled={recordingsLoading}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${recordingsLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-500 dark:text-gray-400">
                Showing {filteredRecordingCalls.length} of {callsWithRecordings.length} recordings
              </div>
            </div>
            {callsWithRecordings.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200/90 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-600 dark:border-gray-700/80 dark:bg-gray-900/40 dark:text-gray-400">
                No recordings yet. Finish a call from the Dialer (end session) to save audio here.
              </p>
            ) : filteredRecordingCalls.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200/90 bg-slate-50/80 px-4 py-6 text-center text-sm text-slate-600 dark:border-gray-700/80 dark:bg-gray-900/40 dark:text-gray-400">
                No recordings match your current filter or search.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-gray-800/80">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200/80 text-xs uppercase tracking-wide text-slate-500 dark:border-gray-800 dark:text-gray-500">
                      <th className="px-4 py-3 font-medium">When</th>
                      <th className="px-4 py-3 font-medium">Outcome</th>
                      <th className="px-4 py-3 font-medium">Duration</th>
                      <th className="min-w-[280px] px-4 py-3 font-medium">Recordings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecordingCalls.map((c) => (
                        <tr
                          key={c.id}
                          className="border-b border-slate-100 dark:border-gray-800/80 last:border-0"
                        >
                          <td className="px-4 py-3 align-top text-slate-800 dark:text-gray-200">{formatCallWhen(c.createdAt)}</td>
                          <td className="px-4 py-3 align-top capitalize text-slate-700 dark:text-gray-300">
                            {(c.outcome || 'unknown').replace(/_/g, ' ')}
                          </td>
                          <td className="px-4 py-3 align-top text-slate-600 dark:text-gray-400">
                            {Math.floor((c.duration || 0) / 60)}m {(c.duration || 0) % 60}s
                          </td>
                          <td className="px-4 py-3 align-top">
                            <CallRecordingPair
                              density="compact"
                              sticky={false}
                              userUrl={c.recordingUserUrl}
                              agentUrl={c.recordingAgentUrl}
                            />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="surface-card p-6 animate-slide-up">
              <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Active Campaign Progress</h2>
              <div className="space-y-6">
                <div>
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="text-slate-600 dark:text-gray-400">List Completion</span>
                    <span className="font-medium text-slate-900 dark:text-white">
                      {contactedLeads} / {totalLeads}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-gray-800">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-all duration-1000 motion-reduce:transition-none"
                      style={{ width: totalLeads > 0 ? `${(contactedLeads / totalLeads) * 100}%` : '0%' }}
                    />
                  </div>
                </div>
              </div>

              {totalLeads === 0 && (
                <div className="mt-8 rounded-xl border border-slate-200/80 bg-slate-100/90 p-8 text-center dark:border-gray-800/40 dark:bg-gray-800/20">
                  <Users className="mx-auto mb-3 h-8 w-8 text-slate-400 dark:text-gray-600" />
                  <p className="font-medium text-slate-700 dark:text-gray-400">No leads in this campaign</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-gray-500">
                    Import a CSV on the Campaigns tab to populate this list.
                  </p>
                  {typeof onNavigateCampaigns === 'function' && (
                    <button
                      type="button"
                      onClick={onNavigateCampaigns}
                      className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 motion-safe:transition-colors"
                    >
                      Go to Campaigns
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="surface-card p-6 animate-slide-up">
              <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Recent Activity (Local)</h2>
              <div className="space-y-4">
                {leads
                  .filter((l) => l.lastOutcome && l.lastOutcome !== 'new')
                  .slice(0, 5)
                  .map((lead) => (
                    <div
                      key={lead.id}
                      className="flex items-start gap-3 border-b border-slate-200/80 pb-4 last:border-0 last:pb-0 dark:border-gray-800/50"
                    >
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-gray-800">
                        <Clock className="h-4 w-4 text-slate-600 dark:text-gray-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-800 dark:text-gray-200">{lead.name || 'Unknown Lead'}</p>
                        <p className="mt-0.5 text-xs text-slate-600 dark:text-gray-500">
                          Marked as{' '}
                          <span className="capitalize text-slate-800 dark:text-gray-300">
                            {lead.lastOutcome.replace('_', ' ')}
                          </span>
                        </p>
                      </div>
                    </div>
                  ))}
                {contactedLeads === 0 && (
                  <p className="py-4 text-center text-sm text-slate-600 dark:text-gray-500">
                    No recent activity in this campaign.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyAnalyticsPanel({ icon: Icon, title, body, primaryLabel, onPrimary, secondaryLabel, onSecondary }) {
  return (
    <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300/90 bg-slate-50/80 px-6 py-10 text-center dark:border-gray-700/80 dark:bg-gray-900/40">
      <Icon className="h-10 w-10 text-slate-400 dark:text-gray-500" aria-hidden />
      <p className="text-base font-medium text-slate-800 dark:text-gray-200">{title}</p>
      <p className="max-w-sm text-sm text-slate-600 dark:text-gray-400">{body}</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        {typeof onPrimary === 'function' && (
          <button
            type="button"
            onClick={onPrimary}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 motion-safe:transition-colors min-h-[44px] sm:min-h-0"
          >
            {primaryLabel}
          </button>
        )}
        {typeof onSecondary === 'function' && (
          <button
            type="button"
            onClick={onSecondary}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 motion-safe:transition-colors dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 min-h-[44px] sm:min-h-0"
          >
            {secondaryLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, trend, color, spark, sparkStroke }) {
  return (
    <div
      className="surface-card group relative overflow-hidden p-6 shadow-lg motion-safe:transition-all motion-safe:duration-300 hover:-translate-y-1 hover:shadow-xl dark:hover:shadow-[0_8px_30px_rgb(0,0,0,0.5)] animate-slide-up"
    >
      <div className={`absolute -right-10 -top-10 h-32 w-32 rounded-full ${color}/20 blur-3xl opacity-30`} />
      <div className="relative z-10 flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-600 dark:text-gray-400">{title}</p>
          <h3 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{value}</h3>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-200 dark:bg-gray-800`}>
          <Icon className="h-5 w-5 text-slate-700 dark:text-gray-300" />
        </div>
      </div>
      {spark && sparkStroke ? <MiniSparkline points={spark} stroke={sparkStroke} /> : null}
      <p className="relative z-10 mt-2 text-xs font-medium text-slate-600 dark:text-gray-500">{trend}</p>
    </div>
  );
}
