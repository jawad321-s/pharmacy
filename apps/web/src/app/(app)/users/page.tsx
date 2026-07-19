'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound, Pencil, Plus, UserX } from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/stores/auth';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorText, PageHeader, Pagination, Spinner } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

const ROLES = ['OWNER', 'BRANCH_MANAGER', 'PHARMACIST', 'CASHIER', 'INVENTORY_MANAGER', 'ACCOUNTANT'];

const createSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  password: z.string().min(8),
  tenantRole: z.string().min(1),
  branchId: z.string().optional(),
});
type CreateForm = z.infer<typeof createSchema>;

interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  tenantRole: string;
  branchId: string | null;
  branch: { id: string; name: string } | null;
  isActive: boolean;
  lastLoginAt: string | null;
}

export default function UsersPage() {
  const { t, locale } = useI18n();
  const { user: currentUser, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canManage = hasPermission('users.manage');

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const users = useQuery({
    queryKey: ['users', search, page],
    queryFn: () =>
      api<{ data: UserRow[]; meta: { pageCount: number } }>('/users', {
        query: { search, page, pageSize: 15 },
      }),
  });

  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: () => api<{ id: string; name: string }[]>('/branches'),
  });

  const form = useForm<CreateForm>({ resolver: zodResolver(createSchema) });

  const save = useMutation({
    mutationFn: (values: CreateForm) => {
      const body = {
        ...values,
        phone: values.phone || undefined,
        branchId: values.branchId || undefined,
      };
      if (editing) {
        const { password: _password, ...update } = body;
        return api(`/users/${editing.id}`, { method: 'PATCH', body: update });
      }
      return api('/users', { method: 'POST', body });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowForm(false);
      setEditing(null);
      form.reset();
    },
  });

  const resetPassword = useMutation({
    mutationFn: () =>
      api(`/users/${resetTarget!.id}/reset-password`, {
        method: 'POST',
        body: { newPassword },
      }),
    onSuccess: () => {
      setResetTarget(null);
      setNewPassword('');
    },
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => api(`/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  return (
    <div>
      <PageHeader title={t('users.title')}>
        <Input
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-52"
        />
        {canManage ? (
          <Button onClick={() => { setEditing(null); form.reset({ tenantRole: 'CASHIER' } as Partial<CreateForm>); setShowForm(true); }}>
            <Plus className="h-4 w-4" />
            {t('users.addUser')}
          </Button>
        ) : null}
      </PageHeader>

      {users.isLoading ? (
        <Spinner />
      ) : !users.data?.data.length ? (
        <EmptyState />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>{t('common.name')}</TH>
                <TH>{t('common.email')}</TH>
                <TH>{t('users.role')}</TH>
                <TH>{t('common.branch')}</TH>
                <TH>{t('users.lastLogin')}</TH>
                <TH>{t('common.status')}</TH>
                <TH className="text-end">{t('common.actions')}</TH>
              </TR>
            </THead>
            <TBody>
              {users.data.data.map((user) => (
                <TR key={user.id}>
                  <TD className="font-medium">{user.firstName} {user.lastName}</TD>
                  <TD dir="ltr">{user.email}</TD>
                  <TD><Badge>{t(`users.${user.tenantRole}`)}</Badge></TD>
                  <TD>{user.branch?.name ?? '—'}</TD>
                  <TD className="text-xs">{formatDate(user.lastLoginAt, locale, true)}</TD>
                  <TD>
                    <Badge variant={user.isActive ? 'success' : 'destructive'}>
                      {user.isActive ? t('common.active') : t('common.inactive')}
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
                            setEditing(user);
                            form.reset({
                              email: user.email,
                              firstName: user.firstName,
                              lastName: user.lastName,
                              phone: user.phone ?? '',
                              tenantRole: user.tenantRole,
                              branchId: user.branchId ?? '',
                              password: 'placeholder1',
                            });
                            setShowForm(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title={t('users.resetPassword')} onClick={() => setResetTarget(user)}>
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        {user.id !== currentUser?.id ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            title={t('users.deactivate')}
                            onClick={() => {
                              if (window.confirm(`${t('users.deactivate')}: ${user.email}?`)) {
                                deactivate.mutate(user.id);
                              }
                            }}
                          >
                            <UserX className="h-4 w-4 text-destructive" />
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination page={page} pageCount={users.data.meta.pageCount} onChange={setPage} />
        </>
      )}

      <Dialog
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? t('users.editUser') : t('users.addUser')}
      >
        <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-3">
          <ErrorText error={save.error} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('auth.firstName')} error={form.formState.errors.firstName?.message}>
              <Input {...form.register('firstName')} />
            </Field>
            <Field label={t('auth.lastName')} error={form.formState.errors.lastName?.message}>
              <Input {...form.register('lastName')} />
            </Field>
          </div>
          <Field label={t('common.email')} error={form.formState.errors.email?.message}>
            <Input dir="ltr" type="email" {...form.register('email')} />
          </Field>
          {!editing ? (
            <Field label={t('auth.password')} error={form.formState.errors.password?.message}>
              <Input dir="ltr" type="password" {...form.register('password')} />
            </Field>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('users.role')} error={form.formState.errors.tenantRole?.message}>
              <Select {...form.register('tenantRole')}>
                {ROLES.map((role) => (
                  <option key={role} value={role}>{t(`users.${role}`)}</option>
                ))}
              </Select>
            </Field>
            <Field label={t('common.branch')}>
              <Select {...form.register('branchId')}>
                <option value="">—</option>
                {branches.data?.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
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

      <Dialog
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        title={`${t('users.resetPassword')} — ${resetTarget?.email ?? ''}`}
      >
        <div className="space-y-3">
          <ErrorText error={resetPassword.error} />
          <Field label={t('users.newPassword')}>
            <Input
              dir="ltr"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </Field>
          <Button
            className="w-full"
            loading={resetPassword.isPending}
            disabled={newPassword.length < 8}
            onClick={() => resetPassword.mutate()}
          >
            {t('common.save')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
