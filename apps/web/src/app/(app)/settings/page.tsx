'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorText, PageHeader, Spinner } from '@/components/ui/misc';
import { Plus, Trash2 } from 'lucide-react';

interface TenantData {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  timezone: string;
  currency: string;
  settings: {
    taxRate: string;
    receiptHeader: string | null;
    receiptFooter: string | null;
    nearExpiryDays: number;
    lowStockThreshold: number;
    loyaltyEarnRate: string;
    loyaltyRedeemValue: string;
    invoicePrefix: string;
    exchangeRates: Record<string, number> | null;
  } | null;
}

interface RateRow {
  code: string;
  rate: string;
}

export default function SettingsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);

  const tenant = useQuery({
    queryKey: ['tenant-me'],
    queryFn: () => api<TenantData>('/tenant/me'),
  });

  const [info, setInfo] = useState({ name: '', email: '', phone: '', address: '', currency: '', timezone: '' });
  const [ops, setOps] = useState({
    taxRate: '15',
    receiptHeader: '',
    receiptFooter: '',
    nearExpiryDays: '90',
    lowStockThreshold: '10',
    loyaltyEarnRate: '1',
    loyaltyRedeemValue: '0.01',
    invoicePrefix: 'INV',
  });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [rates, setRates] = useState<RateRow[]>([]);

  useEffect(() => {
    if (tenant.data) {
      setInfo({
        name: tenant.data.name,
        email: tenant.data.email,
        phone: tenant.data.phone ?? '',
        address: tenant.data.address ?? '',
        currency: tenant.data.currency,
        timezone: tenant.data.timezone,
      });
      const settings = tenant.data.settings;
      if (settings) {
        setOps({
          taxRate: String(Number(settings.taxRate)),
          receiptHeader: settings.receiptHeader ?? '',
          receiptFooter: settings.receiptFooter ?? '',
          nearExpiryDays: String(settings.nearExpiryDays),
          lowStockThreshold: String(settings.lowStockThreshold),
          loyaltyEarnRate: String(Number(settings.loyaltyEarnRate)),
          loyaltyRedeemValue: String(Number(settings.loyaltyRedeemValue)),
          invoicePrefix: settings.invoicePrefix,
        });
        setRates(
          Object.entries(settings.exchangeRates ?? {}).map(([code, rate]) => ({
            code,
            rate: String(rate),
          })),
        );
      }
    }
  }, [tenant.data]);

  const flashSaved = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  const saveInfo = useMutation({
    mutationFn: () =>
      api('/tenant/me', {
        method: 'PATCH',
        body: {
          name: info.name,
          email: info.email,
          phone: info.phone || undefined,
          address: info.address || undefined,
          currency: info.currency,
          timezone: info.timezone,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tenant-me'] });
      flashSaved();
    },
  });

  const saveOps = useMutation({
    mutationFn: () => {
      const exchangeRates: Record<string, number> = {};
      for (const row of rates) {
        const code = row.code.trim().toUpperCase();
        const value = Number(row.rate);
        if (code && code !== info.currency && Number.isFinite(value) && value > 0) {
          exchangeRates[code] = value;
        }
      }
      return api('/tenant/me/settings', {
        method: 'PATCH',
        body: {
          taxRate: Number(ops.taxRate),
          receiptHeader: ops.receiptHeader,
          receiptFooter: ops.receiptFooter,
          nearExpiryDays: Number(ops.nearExpiryDays),
          lowStockThreshold: Number(ops.lowStockThreshold),
          loyaltyEarnRate: Number(ops.loyaltyEarnRate),
          loyaltyRedeemValue: Number(ops.loyaltyRedeemValue),
          invoicePrefix: ops.invoicePrefix,
          exchangeRates,
        },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tenant-me'] });
      flashSaved();
    },
  });

  const changePassword = useMutation({
    mutationFn: () =>
      api('/auth/change-password', { method: 'POST', body: passwords }),
    onSuccess: () => {
      setPasswords({ currentPassword: '', newPassword: '' });
      flashSaved();
    },
  });

  if (tenant.isLoading) return <Spinner />;

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title={t('settings.title')} />
      {saved ? (
        <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
          {t('settings.saved')}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.pharmacyInfo')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ErrorText error={saveInfo.error} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('auth.pharmacyName')}>
              <Input value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} />
            </Field>
            <Field label={t('common.email')}>
              <Input dir="ltr" value={info.email} onChange={(e) => setInfo({ ...info, email: e.target.value })} />
            </Field>
            <Field label={t('common.phone')}>
              <Input dir="ltr" value={info.phone} onChange={(e) => setInfo({ ...info, phone: e.target.value })} />
            </Field>
            <Field label={t('settings.currency')}>
              <Input dir="ltr" value={info.currency} onChange={(e) => setInfo({ ...info, currency: e.target.value })} />
            </Field>
            <Field label={t('settings.timezone')} className="col-span-2">
              <Input dir="ltr" value={info.timezone} onChange={(e) => setInfo({ ...info, timezone: e.target.value })} />
            </Field>
            <Field label={t('common.address')} className="col-span-2">
              <Input value={info.address} onChange={(e) => setInfo({ ...info, address: e.target.value })} />
            </Field>
          </div>
          <Button loading={saveInfo.isPending} onClick={() => saveInfo.mutate()}>
            {t('common.save')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.operational')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ErrorText error={saveOps.error} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('settings.taxRate')}>
              <Input type="number" step="0.01" value={ops.taxRate} onChange={(e) => setOps({ ...ops, taxRate: e.target.value })} />
            </Field>
            <Field label={t('settings.invoicePrefix')}>
              <Input dir="ltr" value={ops.invoicePrefix} onChange={(e) => setOps({ ...ops, invoicePrefix: e.target.value })} />
            </Field>
            <Field label={t('settings.nearExpiryDays')}>
              <Input type="number" value={ops.nearExpiryDays} onChange={(e) => setOps({ ...ops, nearExpiryDays: e.target.value })} />
            </Field>
            <Field label={t('settings.lowStockThreshold')}>
              <Input type="number" value={ops.lowStockThreshold} onChange={(e) => setOps({ ...ops, lowStockThreshold: e.target.value })} />
            </Field>
            <Field label={t('settings.loyaltyEarnRate')}>
              <Input type="number" step="0.0001" value={ops.loyaltyEarnRate} onChange={(e) => setOps({ ...ops, loyaltyEarnRate: e.target.value })} />
            </Field>
            <Field label={t('settings.loyaltyRedeemValue')}>
              <Input type="number" step="0.0001" value={ops.loyaltyRedeemValue} onChange={(e) => setOps({ ...ops, loyaltyRedeemValue: e.target.value })} />
            </Field>
            <Field label={t('settings.receiptHeader')} className="col-span-2">
              <Textarea rows={2} value={ops.receiptHeader} onChange={(e) => setOps({ ...ops, receiptHeader: e.target.value })} />
            </Field>
            <Field label={t('settings.receiptFooter')} className="col-span-2">
              <Textarea rows={2} value={ops.receiptFooter} onChange={(e) => setOps({ ...ops, receiptFooter: e.target.value })} />
            </Field>
          </div>
          <Button loading={saveOps.isPending} onClick={() => saveOps.mutate()}>
            {t('common.save')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.exchangeRates')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t('settings.exchangeRatesHint', { base: info.currency || 'ILS' })}
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
              <span className="w-40 font-semibold">{info.currency || 'ILS'}</span>
              <span className="text-muted-foreground">
                1.00 ({t('pos.baseCurrency')})
              </span>
            </div>
            {rates.map((row, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  dir="ltr"
                  placeholder={t('settings.currencyCode')}
                  className="w-40 uppercase"
                  value={row.code}
                  onChange={(e) => {
                    const next = [...rates];
                    next[index] = { ...row, code: e.target.value };
                    setRates(next);
                  }}
                />
                <span className="text-sm text-muted-foreground">1 =</span>
                <Input
                  dir="ltr"
                  type="number"
                  step="0.0001"
                  min={0}
                  className="w-40"
                  placeholder={t('settings.rateInBase', { base: info.currency || 'ILS' })}
                  value={row.rate}
                  onChange={(e) => {
                    const next = [...rates];
                    next[index] = { ...row, rate: e.target.value };
                    setRates(next);
                  }}
                />
                <span className="text-sm text-muted-foreground">
                  {info.currency || 'ILS'}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setRates(rates.filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRates([...rates, { code: '', rate: '' }])}
            >
              <Plus className="h-4 w-4" />
              {t('settings.addCurrency')}
            </Button>
            <Button loading={saveOps.isPending} onClick={() => saveOps.mutate()}>
              {t('common.save')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.changePassword')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ErrorText error={changePassword.error} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('settings.currentPassword')}>
              <Input
                dir="ltr"
                type="password"
                value={passwords.currentPassword}
                onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
              />
            </Field>
            <Field label={t('users.newPassword')}>
              <Input
                dir="ltr"
                type="password"
                value={passwords.newPassword}
                onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
              />
            </Field>
          </div>
          <Button
            loading={changePassword.isPending}
            disabled={!passwords.currentPassword || passwords.newPassword.length < 8}
            onClick={() => changePassword.mutate()}
          >
            {t('common.save')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
