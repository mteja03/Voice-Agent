import React, { useEffect, useState } from 'react';
import { Users, PhoneCall, CheckCircle2, TrendingUp, Clock, Activity } from 'lucide-react';
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
  Legend
} from 'recharts';
import { apiFetch, BACKEND_URL } from '../services/apiFetch';

const PIE_COLORS = ['#c346ef', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#6b7280'];

export default function DashboardHome({ leads }) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`${BACKEND_URL}/api/analytics`)
      .then((data) => {
        setAnalytics(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch analytics', err);
        setLoading(false);
      });
  }, []);

  const totalLeads = leads.length;
  const contactedLeads = leads.filter(l => (l.lastOutcome || 'new') !== 'new').length;

  const totalCalls = analytics?.totalCalls || 0;
  const interestedCalls = analytics?.interestedCalls || 0;
  const avgDurationSeconds = analytics?.avgDurationSeconds || 0;
  const conversionRate = totalCalls > 0 ? ((interestedCalls / totalCalls) * 100).toFixed(1) : 0;

  const callsByDate = analytics?.callsByDate || [];
  const outcomes = analytics?.outcomes || [];

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-950 text-gray-200">
      <header className="px-8 py-6 border-b border-gray-800/60 bg-gray-900/30 backdrop-blur flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Dashboard Overview</h1>
          <p className="text-sm text-gray-400 mt-1">Global agent performance and active campaign status.</p>
        </div>
        {loading && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Activity className="w-4 h-4 animate-pulse text-brand-400" />
            Syncing...
          </div>
        )}
      </header>

      <div className="flex-1 overflow-auto p-8 custom-scrollbar">
        {/* Global Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard 
            title="Total Calls Made" 
            value={totalCalls} 
            icon={PhoneCall} 
            trend="All-time" 
            color="bg-blue-500" 
          />
          <StatCard 
            title="Interested Leads" 
            value={interestedCalls} 
            icon={CheckCircle2} 
            trend="Needs follow-up" 
            color="bg-emerald-500" 
          />
          <StatCard 
            title="Conversion Rate" 
            value={`${conversionRate}%`} 
            icon={TrendingUp} 
            trend="Global average" 
            color="bg-brand-500" 
          />
          <StatCard
            title="Avg Call Duration"
            value={`${Math.floor(avgDurationSeconds / 60)}m ${avgDurationSeconds % 60}s`}
            icon={Clock}
            trend="Across all calls"
            color="bg-indigo-500"
          />
          <StatCard 
            title="Active Campaign" 
            value={`${contactedLeads}/${totalLeads}`} 
            icon={Users} 
            trend="Leads contacted" 
            color="bg-amber-500" 
          />
        </div>

        {/* Charts Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Line Chart: Calls over time */}
          <div className="lg:col-span-2 bg-gray-900/50 border border-gray-800/60 rounded-2xl p-6 backdrop-blur-sm shadow-xl flex flex-col">
            <h2 className="text-lg font-semibold text-white mb-6">Call Volume (Last 7 Days)</h2>
            <div className="flex-1 min-h-[300px]">
              {callsByDate.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={callsByDate} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#c346ef" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#c346ef" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                    <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '0.75rem', color: '#f3f4f6' }}
                      itemStyle={{ color: '#c346ef' }}
                    />
                    <Area type="monotone" dataKey="count" name="Calls" stroke="#c346ef" strokeWidth={3} fillOpacity={1} fill="url(#colorCalls)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                  Not enough data to display chart.
                </div>
              )}
            </div>
          </div>

          {/* Pie Chart: Outcomes */}
          <div className="bg-gray-900/50 border border-gray-800/60 rounded-2xl p-6 backdrop-blur-sm shadow-xl flex flex-col">
            <h2 className="text-lg font-semibold text-white mb-6">Outcome Distribution</h2>
            <div className="flex-1 min-h-[300px]">
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
                      contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '0.75rem', color: '#f3f4f6' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                  No outcome data available.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Campaign Progress / Recent Activity layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-gray-900/50 border border-gray-800/60 rounded-2xl p-6 backdrop-blur-sm">
            <h2 className="text-lg font-semibold text-white mb-4">Active Campaign Progress</h2>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-400">List Completion</span>
                  <span className="text-white font-medium">{contactedLeads} / {totalLeads}</span>
                </div>
                <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                  <div 
                    className="h-full bg-brand-500 rounded-full transition-all duration-1000" 
                    style={{ width: totalLeads > 0 ? `${(contactedLeads / totalLeads) * 100}%` : '0%' }}
                  />
                </div>
              </div>
            </div>

            {totalLeads === 0 && (
              <div className="mt-8 text-center p-8 bg-gray-800/20 border border-gray-800/40 rounded-xl">
                <Users className="w-8 h-8 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400 font-medium">No active campaigns</p>
                <p className="text-sm text-gray-500 mt-1">Head over to the Campaigns tab to import your first CSV.</p>
              </div>
            )}
          </div>

          <div className="bg-gray-900/50 border border-gray-800/60 rounded-2xl p-6 backdrop-blur-sm">
            <h2 className="text-lg font-semibold text-white mb-4">Recent Activity (Local)</h2>
            <div className="space-y-4">
              {leads.filter(l => l.lastOutcome && l.lastOutcome !== 'new').slice(0, 5).map(lead => (
                <div key={lead.id} className="flex items-start gap-3 border-b border-gray-800/50 pb-4 last:border-0 last:pb-0">
                  <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Clock className="w-4 h-4 text-gray-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-200">{lead.name || 'Unknown Lead'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Marked as <span className="capitalize text-gray-300">{lead.lastOutcome.replace('_', ' ')}</span></p>
                  </div>
                </div>
              ))}
              {contactedLeads === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">No recent activity in this campaign.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, trend, color }) {
  return (
    <div className="bg-gray-900/50 border border-gray-800/60 rounded-2xl p-6 backdrop-blur-sm relative overflow-hidden group hover:border-gray-700/80 transition-colors shadow-lg">
      <div className={`absolute top-0 right-0 w-32 h-32 ${color}/5 rounded-full blur-3xl -mr-10 -mt-10 transition-opacity group-hover:opacity-100 opacity-50`}></div>
      <div className="flex justify-between items-start relative z-10">
        <div>
          <p className="text-sm font-medium text-gray-400">{title}</p>
          <h3 className="text-3xl font-bold text-white mt-2">{value}</h3>
        </div>
        <div className={`w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center`}>
          <Icon className={`w-5 h-5 text-gray-300`} />
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-4 font-medium relative z-10">{trend}</p>
    </div>
  );
}
