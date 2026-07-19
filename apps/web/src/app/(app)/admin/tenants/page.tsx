'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Badge, statusVariant } from '@/components/ui/badge';
import { EmptyState, ErrorText, PageHeader, Pagination, Spinner } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

interface TenantRow {
  id: string;
  name: string;
  subdomain: string;
  email: string;
  status: string;
  createdAt: string;
  plan: { name: string } | null;
  _count: { users: number; branches: number; sales: number };
  subscriptions: { status: string; endsAt: string }[];
}

export default function AdminTenantsPage() {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const tenants = useQuery({
    queryKey: ['admin-tenants', search, status, page],
    queryFn: () =>
      api<{ data: TenantRow[]; meta: { pageCount: number } }>('/admin/tenants', {
        query: { search, status, page, pageSize: 15 },
      }),
  });

  const setTenantStatus = useMutation({
    mutationFn: ({ id, next }: { id: string; next: string }) =>
      api(`/admin/tenants/${id}/status`, { method: 'PATCH', body: { status: next } }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['admin-tenants'] }),
  });

  return (
    <div>
      <PageHeader title={t('admin.tenants')}>
        <Input
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-52"
        />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-40">
          <option value="">{t('common.status')}</option>
          {['TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED'].map((value) => (
            <option key={value} value={value}>{t(`admin.${value}`)}</option>
          ))}
        </Select>
      </PageHeader>

      <ErrorText error={setTenantStatus.error} />

      {tenants.isLoading ? (
        <Spinner />
      ) : !tenants.data?.data.length ? (
        <EmptyState />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>{t('common.name')}</TH>
                <TH>{t('auth.subdomain')}</TH>
                <TH>{t('admin.plan')}</TH>
                <TH>{t('billing.users')}</TH>
                <TH>{t('billing.branches')}</TH>
                <TH>{t('billing.expiresOn')}</TH>
                <TH>{t('common.status')}</TH>
                <TH className="text-end">{t('common.actions')}</TH>
              </TR>
            </THead>
            <TBody>
              {tenants.data.data.map((tenant) => (
                <TR key={tenant.id}>
                  <TD>
                    <p className="font-medium">{tenant.name}</p>
                    <p className="text-xs text-muted-foreground" dir="ltr">{tenant.email}</p>
                  </TD>
                  <TD className="num text-xs">{tenant.subdomain}</TD>
                  <TD>{tenant.plan?.name ?? '—'}</TD>
                  <TD className="num">{tenant._count.users}</TD>
                  <TD className="num">{tenant._count.branches}</TD>
                  <TD className="text-xs">
                    {tenant.subscriptions[0]
                      ? formatDate(tenant.subscriptions[0].endsAt, locale)
                      : '—'}
                  </TD>
                  <TD>
                    <Badge variant={statusVariant(tenant.status)}>
                      {t(`admin.${tenant.status}`)}
                    </Badge>
                  </TD>
                  <TD className="text-end">
                    {tenant.status === 'SUSPENDED' || tenant.status === 'CANCELLED' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        loading={setTenantStatus.isPending}
                        onClick={() => setTenantStatus.mutate({ id: tenant.id, next: 'ACTIVE' })}
                      >
                        {t('admin.activate')}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        loading={setTenantStatus.isPending}
                        onClick={() => {
                          if (window.confirm(`${t('admin.suspend')}: ${tenant.name}?`)) {
                            setTenantStatus.mutate({ id: tenant.id, next: 'SUSPENDED' });
                          }
                        }}
                      >
                        {t('admin.suspend')}
                      </Button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination page={page} pageCount={tenants.data.meta.pageCount} onChange={setPage} />
        </>
      )}
    </div>
  );
}
