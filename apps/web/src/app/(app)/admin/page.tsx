'use client';

import { useQuery } from '@tanstack/react-query';
import { Building2, DollarSign, Percent, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { formatDate, formatMoney, formatNumber } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, statusVariant } from '@/components/ui/badge';
import { PageHeader, Spinner, StatCard } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

interface PlatformDashboard {
  totalTenants: number;
  activeTenants: number;
  trialTenants: number;
  suspendedTenants: number;
  monthlyRevenue: number;
  churnRate: number;
  subscriptionsByStatus: { status: string; count: number }[];
  recentTenants: {
    id: string;
    name: string;
    subdomain: string;
    status: string;
    createdAt: string;
    plan: { name: string } | null;
  }[];
  platformUsage: { totalUsers: number; totalSales: number; totalProducts: number };
}

export default function AdminDashboardPage() {
  const { t, locale } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => api<PlatformDashboard>('/admin/dashboard'),
  });

  if (isLoading || !data) return <Spinner />;

  return (
    <div className="space-y-4">
      <PageHeader title={t('admin.title')} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('admin.totalTenants')}
          value={formatNumber(data.totalTenants, locale)}
          icon={<Building2 className="h-4 w-4" />}
        />
        <StatCard
          label={t('admin.activeTenants')}
          value={`${formatNumber(data.activeTenants, locale)} (+${formatNumber(data.trialTenants, locale)} ${t('admin.TRIAL')})`}
          icon={<Users className="h-4 w-4" />}
          tone="success"
        />
        <StatCard
          label={t('admin.monthlyRevenue')}
          value={formatMoney(data.monthlyRevenue, 'USD', locale)}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <StatCard
          label={t('admin.churnRate')}
          value={`${data.churnRate}%`}
          icon={<Percent className="h-4 w-4" />}
          tone={data.churnRate > 5 ? 'warning' : 'default'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t('admin.platformUsage')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>{t('admin.totalUsers')}</span>
              <span className="num font-semibold">{formatNumber(data.platformUsage.totalUsers, locale)}</span>
            </div>
            <div className="flex justify-between">
              <span>{t('admin.totalSales')}</span>
              <span className="num font-semibold">{formatNumber(data.platformUsage.totalSales, locale)}</span>
            </div>
            <div className="flex justify-between">
              <span>{t('admin.totalProducts')}</span>
              <span className="num font-semibold">{formatNumber(data.platformUsage.totalProducts, locale)}</span>
            </div>
            <div className="mt-3 border-t pt-3">
              {data.subscriptionsByStatus.map((row) => (
                <div key={row.status} className="flex justify-between py-0.5">
                  <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                  <span className="num">{row.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('admin.recentTenants')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>{t('common.name')}</TH>
                  <TH>{t('auth.subdomain')}</TH>
                  <TH>{t('admin.plan')}</TH>
                  <TH>{t('common.status')}</TH>
                  <TH>{t('common.date')}</TH>
                </TR>
              </THead>
              <TBody>
                {data.recentTenants.map((tenant) => (
                  <TR key={tenant.id}>
                    <TD className="font-medium">{tenant.name}</TD>
                    <TD className="num text-xs">{tenant.subdomain}</TD>
                    <TD>{tenant.plan?.name ?? '—'}</TD>
                    <TD>
                      <Badge variant={statusVariant(tenant.status)}>
                        {t(`admin.${tenant.status}`)}
                      </Badge>
                    </TD>
                    <TD className="text-xs">{formatDate(tenant.createdAt, locale)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
