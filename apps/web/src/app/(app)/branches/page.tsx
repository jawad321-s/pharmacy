'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorText, PageHeader, Spinner } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

const schema = z.object({
  name: z.string().min(1),
  nameAr: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  managerId: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

interface Branch {
  id: string;
  name: string;
  nameAr: string | null;
  address: string | null;
  phone: string | null;
  isMain: boolean;
  isActive: boolean;
  manager: { id: string; firstName: string; lastName: string } | null;
  _count: { users: number };
}

export default function BranchesPage() {
  const { t, locale } = useI18n();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canManage = hasPermission('branches.manage');

  const [editing, setEditing] = useState<Branch | null>(null);
  const [showForm, setShowForm] = useState(false);

  const branches = useQuery({
    queryKey: ['branches-full'],
    queryFn: () => api<Branch[]>('/branches'),
  });

  const users = useQuery({
    queryKey: ['users-all'],
    queryFn: () =>
      api<{ data: { id: string; firstName: string; lastName: string }[] }>('/users', {
        query: { pageSize: 100 },
      }),
    enabled: canManage,
  });

  const form = useForm<FormValues>({ resolver: zodResolver(schema) });

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const body = { ...values, managerId: values.managerId || undefined };
      return editing
        ? api(`/branches/${editing.id}`, { method: 'PATCH', body })
        : api('/branches', { method: 'POST', body });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['branches-full'] });
      void queryClient.invalidateQueries({ queryKey: ['branches'] });
      setShowForm(false);
      setEditing(null);
      form.reset();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/branches/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['branches-full'] });
      void queryClient.invalidateQueries({ queryKey: ['branches'] });
    },
  });

  return (
    <div>
      <PageHeader title={t('branches.title')}>
        {canManage ? (
          <Button onClick={() => { setEditing(null); form.reset({}); setShowForm(true); }}>
            <Plus className="h-4 w-4" />
            {t('branches.addBranch')}
          </Button>
        ) : null}
      </PageHeader>

      <ErrorText error={remove.error} />

      {branches.isLoading ? (
        <Spinner />
      ) : !branches.data?.length ? (
        <EmptyState />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{t('common.name')}</TH>
              <TH>{t('common.address')}</TH>
              <TH>{t('common.phone')}</TH>
              <TH>{t('branches.manager')}</TH>
              <TH>{t('users.title')}</TH>
              <TH>{t('common.status')}</TH>
              <TH className="text-end">{t('common.actions')}</TH>
            </TR>
          </THead>
          <TBody>
            {branches.data.map((branch) => (
              <TR key={branch.id}>
                <TD>
                  <span className="font-medium">
                    {locale === 'ar' && branch.nameAr ? branch.nameAr : branch.name}
                  </span>
                  {branch.isMain ? (
                    <Badge className="ms-2">{t('branches.mainBranch')}</Badge>
                  ) : null}
                </TD>
                <TD>{branch.address ?? '—'}</TD>
                <TD className="num">{branch.phone ?? '—'}</TD>
                <TD>
                  {branch.manager
                    ? `${branch.manager.firstName} ${branch.manager.lastName}`
                    : '—'}
                </TD>
                <TD>{branch._count.users}</TD>
                <TD>
                  <Badge variant={branch.isActive ? 'success' : 'destructive'}>
                    {branch.isActive ? t('common.active') : t('common.inactive')}
                  </Badge>
                </TD>
                <TD>
                  {canManage ? (
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t('common.edit')}
                        onClick={() => {
                          setEditing(branch);
                          form.reset({
                            name: branch.name,
                            nameAr: branch.nameAr ?? '',
                            address: branch.address ?? '',
                            phone: branch.phone ?? '',
                            managerId: branch.manager?.id ?? '',
                          });
                          setShowForm(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {!branch.isMain ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          title={t('common.delete')}
                          onClick={() => {
                            if (window.confirm(`${t('common.delete')}: ${branch.name}?`)) {
                              remove.mutate(branch.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <Dialog
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? t('branches.editBranch') : t('branches.addBranch')}
      >
        <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-3">
          <ErrorText error={save.error} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('medicines.nameEn')} error={form.formState.errors.name?.message}>
              <Input dir="ltr" {...form.register('name')} />
            </Field>
            <Field label={t('medicines.nameAr')}>
              <Input dir="rtl" {...form.register('nameAr')} />
            </Field>
          </div>
          <Field label={t('common.address')}>
            <Input {...form.register('address')} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('common.phone')}>
              <Input dir="ltr" {...form.register('phone')} />
            </Field>
            <Field label={t('branches.manager')}>
              <Select {...form.register('managerId')}>
                <option value="">—</option>
                {users.data?.data.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.firstName} {user.lastName}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>{t('common.save')}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
