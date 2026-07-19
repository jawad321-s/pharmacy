'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorText, PageHeader, Spinner } from '@/components/ui/misc';

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
  } | null;
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
    mutationFn: () =>
      api('/tenant/me/settings', {
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
        },
      }),
    onSuccess: flashSaved,
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
