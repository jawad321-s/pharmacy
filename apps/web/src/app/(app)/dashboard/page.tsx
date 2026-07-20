'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  PackageX,
  TrendingUp,
  Wallet,
  Warehouse,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/stores/auth';
import { formatDate, formatMoney, formatNumber } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Spinner, StatCard } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

interface DashboardData {
  revenueToday: number;
  salesCountToday: number;
  revenueMonth: number;
  salesCountMonth: number;
  expensesMonth: number;
  profitMonth: number;
  inventoryValue: number;
  alerts: { outOfStock: number; lowStock: number; nearExpiry: number; expired: number };
  recentSales: {
    id: string;
    number: string;
    total: string;
    status: string;
    createdAt: string;
    customer: { name: string } | null;
    user: { firstName: string; lastName: string } | null;
  }[];
  topMedicines: { medicineId: string; name: string; nameAr: string | null; quantity: number; revenue: number }[];
  salesChart: { date: string; total: number }[];
}

export default function DashboardPage() {
  const { t, locale } = useI18n();
  const tenant = useAuth((state) => state.tenant);
  const currency = tenant?.currency ?? 'ILS';

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<DashboardData>('/dashboard'),
  });

  if (isLoading || !data) return <Spinner />;

  const alertItems = [
    { key: 'outOfStock', value: data.alerts.outOfStock, label: t('dashboard.outOfStock'), icon: <PackageX className="h-4 w-4" />, tone: 'destructive' as const, alert: 'out' },
    { key: 'lowStock', value: data.alerts.lowStock, label: t('dashboard.lowStock'), icon: <AlertTriangle className="h-4 w-4" />, tone: 'warning' as const, alert: 'low' },
    { key: 'nearExpiry', value: data.alerts.nearExpiry, label: t('dashboard.nearExpiry'), icon: <CalendarClock className="h-4 w-4" />, tone: 'warning' as const, alert: 'nearExpiry' },
    { key: 'expired', value: data.alerts.expired, label: t('dashboard.expired'), icon: <PackageX className="h-4 w-4" />, tone: 'destructive' as const, alert: 'expired' },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t('dashboard.title')}</h1>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label={t('dashboard.revenueToday')}
          value={formatMoney(data.revenueToday, currency, locale)}
          icon={<Banknote className="h-4 w-4" />}
        />
        <StatCard
          label={t('dashboard.revenueMonth')}
          value={formatMoney(data.revenueMonth, currency, locale)}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label={t('dashboard.profitMonth')}
          value={formatMoney(data.profitMonth, currency, locale)}
          icon={<TrendingUp className="h-4 w-4" />}
          tone={data.profitMonth >= 0 ? 'success' : 'destructive'}
        />
        <StatCard
          label={t('dashboard.expensesMonth')}
          value={formatMoney(data.expensesMonth, currency, locale)}
          icon={<Wallet className="h-4 w-4" />}
          tone="warning"
        />
        <StatCard
          label={t('dashboard.inventoryValue')}
          value={formatMoney(data.inventoryValue, currency, locale)}
          icon={<Warehouse className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {alertItems.map((item) => (
          <Link key={item.key} href={`/inventory?alert=${item.alert}`}>
            <StatCard
              label={item.label}
              value={formatNumber(item.value, locale)}
              icon={item.icon}
              tone={item.value > 0 ? item.tone : 'default'}
            />
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('dashboard.salesChart')}</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.salesChart}>
                <defs>
                  <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(152 45% 35%)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(152 45% 35%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value: string) => value.slice(5)}
                />
                <YAxis tick={{ fontSize: 11 }} width={50} />
                <Tooltip
                  formatter={(value) => formatMoney(Number(value), currency, locale)}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="hsl(152 45% 35%)"
                  strokeWidth={2}
                  fill="url(#salesFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.topMedicines')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.topMedicines.map((medicine, index) => (
              <div key={medicine.medicineId} className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {locale === 'ar' && medicine.nameAr ? medicine.nameAr : medicine.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatNumber(medicine.quantity, locale)} × —{' '}
                    {formatMoney(medicine.revenue, currency, locale)}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.recentSales')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>{t('pos.invoiceNumber')}</TH>
                <TH>{t('common.date')}</TH>
                <TH>{t('pos.customer')}</TH>
                <TH>{t('common.status')}</TH>
                <TH className="text-end">{t('common.total')}</TH>
              </TR>
            </THead>
            <TBody>
              {data.recentSales.map((sale) => (
                <TR key={sale.id}>
                  <TD className="font-medium">{sale.number}</TD>
                  <TD>{formatDate(sale.createdAt, locale, true)}</TD>
                  <TD>{sale.customer?.name ?? t('pos.walkIn')}</TD>
                  <TD>
                    <Badge variant={statusVariant(sale.status)}>{sale.status}</Badge>
                  </TD>
                  <TD className="num text-end font-medium">
                    {formatMoney(sale.total, currency, locale)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
