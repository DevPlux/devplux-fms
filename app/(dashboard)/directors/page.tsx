'use client';

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatLKR, formatPercentage } from '@/lib/formatting/formatters';
import { RefreshCw, CheckCircle2 } from 'lucide-react';

interface DirectorData {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: 'director';
  roleTitle: 'Director';
  sharePercentage: number;
  capitalContributed: number;
  mustChangePassword: boolean;
  isActive: boolean;
  updatedAt?: string;
}

const DEFAULT_DIRECTORS: DirectorData[] = [
  {
    id: 'd1',
    name: 'Mr. Chanuka Lakshan',
    email: 'director1@devplux.com',
    role: 'director',
    roleTitle: 'Director',
    sharePercentage: 20.0,
    capitalContributed: 0,
    mustChangePassword: true,
    isActive: true,
  },
  {
    id: 'd2',
    name: 'Mr. Lakindu Udara',
    email: 'director2@devplux.com',
    role: 'director',
    roleTitle: 'Director',
    sharePercentage: 20.0,
    capitalContributed: 0,
    mustChangePassword: true,
    isActive: true,
  },
  {
    id: 'd3',
    name: 'Mr. Janindu Chamoth',
    email: 'director3@devplux.com',
    role: 'director',
    roleTitle: 'Director',
    sharePercentage: 20.0,
    capitalContributed: 0,
    mustChangePassword: true,
    isActive: true,
  },
  {
    id: 'd4',
    name: 'Mr. Harsha Chathuranga',
    email: 'director4@devplux.com',
    role: 'director',
    roleTitle: 'Director',
    sharePercentage: 20.0,
    capitalContributed: 0,
    mustChangePassword: true,
    isActive: true,
  },
  {
    id: 'd5',
    name: 'Mr. Amila Lakshan',
    email: 'director5@devplux.com',
    role: 'director',
    roleTitle: 'Director',
    sharePercentage: 20.0,
    capitalContributed: 0,
    mustChangePassword: true,
    isActive: true,
  },
];

export default function DirectorsPage() {
  const [directors, setDirectors] = useState<DirectorData[]>(DEFAULT_DIRECTORS);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchDirectors = async (showRefreshSpinner = false) => {
    if (showRefreshSpinner) setIsRefreshing(true);
    try {
      const res = await fetch('/api/directors', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (json.data && Array.isArray(json.data) && json.data.length > 0) {
          setDirectors(json.data);
        }
      }
    } catch (err) {
      console.warn('Error fetching live directors:', err);
    } finally {
      setIsLoading(false);
      if (showRefreshSpinner) setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDirectors(false);
  }, []);

  const totalShares = directors.reduce((acc, d) => acc + (d.sharePercentage || 0), 0);
  const totalCapital = directors.reduce((acc, d) => acc + (d.capitalContributed || 0), 0);
  const enactedCount = directors.filter((d) => !d.mustChangePassword).length;
  const pendingCount = directors.filter((d) => d.mustChangePassword).length;

  return (
    <DashboardLayout
      pageTitle="Directors Governance Register"
      pageDescription="Board of Directors governance, shareholding allocations, and live authentication credentials status."
      userRole="director"
    >
      {/* Governance Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 font-semibold uppercase">Total Board Directors</p>
            <p className="text-xl font-bold text-slate-900 mt-1">{directors.length} Directors</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Devplux (Pvt) Ltd — PV-00289144</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 font-semibold uppercase">Setup Enacted</p>
            <p className="text-xl font-bold text-emerald-700 mt-1">{enactedCount} / {directors.length}</p>
            <p className="text-[11px] text-emerald-600 mt-0.5">Completed 1st-login setup</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 font-semibold uppercase">Setup Pending</p>
            <p className="text-xl font-bold text-amber-700 mt-1">{pendingCount} Accounts</p>
            <p className="text-[11px] text-amber-600 mt-0.5">Initial password change required</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 font-semibold uppercase">Total Share Allocation</p>
            <p className="text-xl font-bold text-blue-700 mt-1 tabular-numbers">
              {formatPercentage(totalShares)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">20.00% per director agreement</p>
          </CardContent>
        </Card>
      </div>

      {/* Directors Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle>Board of Directors Profile & Authentication Status</CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              Live status synchronized directly with corporate identity credentials and database records.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchDirectors(true)}
            disabled={isRefreshing}
            className="flex items-center gap-2 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Checking DB...' : 'Refresh Status'}</span>
          </Button>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">Director Name</th>
                <th className="px-6 py-3.5">Corporate Email</th>
                <th className="px-6 py-3.5">Assigned Governance Role</th>
                <th className="px-6 py-3.5 text-right">Shareholding</th>
                <th className="px-6 py-3.5 text-right">Capital Contributed</th>
                <th className="px-6 py-3.5 text-center">First-Login Setup</th>
                <th className="px-6 py-3.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-slate-400 text-xs">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                      <span>Loading live director credentials from Supabase...</span>
                    </div>
                  </td>
                </tr>
              ) : (
                directors.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 font-semibold text-slate-900">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 text-white flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden">
                          {d.avatarUrl ? (
                            <img src={d.avatarUrl} alt={d.name} className="w-full h-full object-cover" />
                          ) : (
                            (d.name.replace(/^(mr\.|mr|mrs\.|mrs|ms\.|ms|dr\.|dr|prof\.|prof)\s*/i, '').trim().charAt(0) || 'D').toUpperCase()
                          )}
                        </div>
                        <span className="truncate">{d.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-700">{d.email}</td>
                    <td className="px-6 py-4">
                      <span className="font-semibold text-blue-900 bg-blue-50 px-2 py-0.5 rounded text-[11px] border border-blue-100">
                        {d.roleTitle}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-slate-900 tabular-numbers">
                      {formatPercentage(d.sharePercentage)}
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-slate-900 tabular-numbers">
                      {formatLKR(d.capitalContributed)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {d.mustChangePassword ? (
                        <Badge variant="pending">SETUP REQUIRED</Badge>
                      ) : (
                        <Badge variant="completed">ENACTED</Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {d.isActive ? (
                        <Badge variant="completed">ACTIVE</Badge>
                      ) : (
                        <Badge variant="danger">INACTIVE</Badge>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </DashboardLayout>
  );
}
