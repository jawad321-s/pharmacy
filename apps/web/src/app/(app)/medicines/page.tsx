'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Archive, Barcode, Download, Layers, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { BarcodeLabelsDialog, type LabelTarget } from '@/components/barcode-labels';
import { api, downloadFile } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/stores/auth';
import { formatDate, formatMoney } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { Badge, statusVariant } from '@/components/ui/badge';
import { EmptyState, ErrorText, PageHeader, Pagination, Spinner } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

const medicineSchema = z.object({
  barcode: z.string().min(1),
  name: z.string().min(1),
  nameAr: z.string().optional(),
  scientificName: z.string().optional(),
  manufacturer: z.string().optional(),
  categoryId: z.string().optional(),
  supplierId: z.string().optional(),
  purchasePrice: z.coerce.number().min(0),
  sellingPrice: z.coerce.number().min(0),
  costPrice: z.coerce.number().min(0).optional(),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  unit: z.string().optional(),
  minStock: z.coerce.number().int().min(0).optional(),
  description: z.string().optional(),
});
type MedicineForm = z.infer<typeof medicineSchema>;

const batchSchema = z.object({
  batchNumber: z.string().min(1),
  expiryDate: z.string().min(1),
  manufacturingDate: z.string().optional(),
  quantity: z.coerce.number().int().min(0),
  costPrice: z.coerce.number().min(0).optional(),
  branchId: z.string().min(1),
});
type BatchForm = z.infer<typeof batchSchema>;

interface Medicine {
  id: string;
  barcode: string;
  sku: string;
  name: string;
  nameAr: string | null;
  scientificName: string | null;
  manufacturer: string | null;
  categoryId: string | null;
  supplierId: string | null;
  category: { id: string; name: string } | null;
  supplier: { id: string; name: string } | null;
  purchasePrice: string;
  costPrice: string;
  sellingPrice: string;
  taxRate: string;
  unit: string;
  minStock: number;
  status: string;
  totalQuantity: number;
  profitMargin: number | null;
  description?: string | null;
}

export default function MedicinesPage() {
  const { t, locale } = useI18n();
  const { tenant, hasPermission } = useAuth();
  const currency = tenant?.currency ?? 'SAR';
  const queryClient = useQueryClient();
  const canManage = hasPermission('medicines.manage');

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [categoryId, setCategoryId] = useState('');
  const [editing, setEditing] = useState<Medicine | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [batchTarget, setBatchTarget] = useState<Medicine | null>(null);
  const [labelTarget, setLabelTarget] = useState<LabelTarget | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<string | null>(null);

  const medicines = useQuery({
    queryKey: ['medicines', search, page, categoryId],
    queryFn: () =>
      api<{ data: Medicine[]; meta: { pageCount: number } }>('/medicines', {
        query: { search, page, pageSize: 15, categoryId },
      }),
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<{ id: string; name: string; nameAr: string | null }[]>('/categories'),
  });
  const suppliers = useQuery({
    queryKey: ['suppliers-all'],
    queryFn: () => api<{ data: { id: string; name: string }[] }>('/suppliers', { query: { pageSize: 100 } }),
  });
  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: () => api<{ id: string; name: string }[]>('/branches'),
  });

  const form = useForm<MedicineForm>({ resolver: zodResolver(medicineSchema) });
  const batchForm = useForm<BatchForm>({ resolver: zodResolver(batchSchema) });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['medicines'] });

  const save = useMutation({
    mutationFn: (values: MedicineForm) => {
      const body = {
        ...values,
        categoryId: values.categoryId || undefined,
        supplierId: values.supplierId || undefined,
      };
      return editing
        ? api(`/medicines/${editing.id}`, { method: 'PATCH', body })
        : api('/medicines', { method: 'POST', body });
    },
    onSuccess: () => {
      void invalidate();
      setShowForm(false);
      setEditing(null);
      form.reset();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/medicines/${id}`, { method: 'DELETE' }),
    onSuccess: () => void invalidate(),
  });

  const archive = useMutation({
    mutationFn: (medicine: Medicine) =>
      api(`/medicines/${medicine.id}`, {
        method: 'PATCH',
        body: { status: medicine.status === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED' },
      }),
    onSuccess: () => void invalidate(),
  });

  const addBatch = useMutation({
    mutationFn: (values: BatchForm) =>
      api(`/medicines/${batchTarget!.id}/batches`, { method: 'POST', body: values }),
    onSuccess: () => {
      void invalidate();
      setBatchTarget(null);
      batchForm.reset();
    },
  });

  const importExcel = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api<{ created: number; updated: number; errors: unknown[] }>(
        '/medicines/import',
        { method: 'POST', formData },
      );
    },
    onSuccess: (result) => {
      setImportResult(
        t('medicines.importDone', { created: result.created, updated: result.updated }),
      );
      void invalidate();
    },
  });

  const openEdit = (medicine: Medicine) => {
    setEditing(medicine);
    form.reset({
      barcode: medicine.barcode,
      name: medicine.name,
      nameAr: medicine.nameAr ?? '',
      scientificName: medicine.scientificName ?? '',
      manufacturer: medicine.manufacturer ?? '',
      categoryId: medicine.categoryId ?? '',
      supplierId: medicine.supplierId ?? '',
      purchasePrice: Number(medicine.purchasePrice),
      sellingPrice: Number(medicine.sellingPrice),
      costPrice: Number(medicine.costPrice),
      taxRate: Number(medicine.taxRate),
      unit: medicine.unit,
      minStock: medicine.minStock,
      description: medicine.description ?? '',
    });
    setShowForm(true);
  };

  return (
    <div>
      <PageHeader title={t('medicines.title')}>
        <Input
          placeholder={t('common.search')}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          className="w-52"
        />
        <Select
          value={categoryId}
          onChange={(event) => {
            setCategoryId(event.target.value);
            setPage(1);
          }}
          className="w-44"
        >
          <option value="">{t('medicines.category')}</option>
          {categories.data?.map((category) => (
            <option key={category.id} value={category.id}>
              {locale === 'ar' && category.nameAr ? category.nameAr : category.name}
            </option>
          ))}
        </Select>
        <Button
          variant="outline"
          onClick={() => downloadFile('/medicines/export', 'medicines.xlsx')}
        >
          <Download className="h-4 w-4" />
          {t('common.exportExcel')}
        </Button>
        {canManage ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) importExcel.mutate(file);
                event.target.value = '';
              }}
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()} loading={importExcel.isPending}>
              <Upload className="h-4 w-4" />
              {t('common.import')}
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                form.reset({ taxRate: 15, unit: 'piece', minStock: 10 } as Partial<MedicineForm>);
                setShowForm(true);
              }}
            >
              <Plus className="h-4 w-4" />
              {t('medicines.addMedicine')}
            </Button>
          </>
        ) : null}
      </PageHeader>

      {importResult ? (
        <p className="mb-3 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
          {importResult}
        </p>
      ) : null}

      {medicines.isLoading ? (
        <Spinner />
      ) : !medicines.data?.data.length ? (
        <EmptyState />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>{t('medicines.barcode')}</TH>
                <TH>{t('common.name')}</TH>
                <TH>{t('medicines.category')}</TH>
                <TH className="text-end">{t('medicines.sellingPrice')}</TH>
                <TH className="text-end">{t('medicines.profitMargin')}</TH>
                <TH className="text-end">{t('common.quantity')}</TH>
                <TH>{t('common.status')}</TH>
                <TH className="text-end">{t('common.actions')}</TH>
              </TR>
            </THead>
            <TBody>
              {medicines.data.data.map((medicine) => (
                <TR key={medicine.id}>
                  <TD className="num text-xs">{medicine.barcode}</TD>
                  <TD>
                    <p className="font-medium">
                      {locale === 'ar' && medicine.nameAr ? medicine.nameAr : medicine.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {medicine.scientificName}
                    </p>
                  </TD>
                  <TD>{medicine.category?.name ?? '—'}</TD>
                  <TD className="num text-end">
                    {formatMoney(medicine.sellingPrice, currency, locale)}
                  </TD>
                  <TD className="num text-end">
                    {medicine.profitMargin !== null ? `${medicine.profitMargin}%` : '—'}
                  </TD>
                  <TD className="text-end">
                    <Badge
                      variant={
                        medicine.totalQuantity === 0
                          ? 'destructive'
                          : medicine.totalQuantity <= medicine.minStock
                            ? 'warning'
                            : 'success'
                      }
                    >
                      {medicine.totalQuantity}
                    </Badge>
                  </TD>
                  <TD>
                    <Badge variant={statusVariant(medicine.status)}>
                      {medicine.status === 'ARCHIVED' ? t('medicines.archived') : t('common.active')}
                    </Badge>
                  </TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t('medicines.printLabels')}
                        onClick={() =>
                          setLabelTarget({
                            name: medicine.name,
                            nameAr: medicine.nameAr,
                            barcode: medicine.barcode,
                            sellingPrice: medicine.sellingPrice,
                          })
                        }
                      >
                        <Barcode className="h-4 w-4" />
                      </Button>
                      {canManage ? (
                        <>
                          <Button variant="ghost" size="icon" title={t('medicines.addBatch')}
                            onClick={() => {
                              setBatchTarget(medicine);
                              batchForm.reset({ branchId: branches.data?.[0]?.id ?? '', quantity: 0 } as Partial<BatchForm>);
                            }}
                          >
                            <Layers className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title={t('common.edit')} onClick={() => openEdit(medicine)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title={t('medicines.archive')} onClick={() => archive.mutate(medicine)}>
                            <Archive className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title={t('common.delete')}
                            onClick={() => {
                              if (window.confirm(`${t('common.delete')}: ${medicine.name}?`)) {
                                remove.mutate(medicine.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination
            page={page}
            pageCount={medicines.data.meta.pageCount}
            onChange={setPage}
          />
        </>
      )}

      <Dialog
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? t('medicines.editMedicine') : t('medicines.addMedicine')}
        wide
      >
        <form
          onSubmit={form.handleSubmit((values) => save.mutate(values))}
          className="grid grid-cols-2 gap-3"
        >
          <div className="col-span-2">
            <ErrorText error={save.error} />
          </div>
          <Field label={t('medicines.barcode')} error={form.formState.errors.barcode?.message}>
            <Input dir="ltr" {...form.register('barcode')} />
          </Field>
          <Field label={t('medicines.manufacturer')}>
            <Input {...form.register('manufacturer')} />
          </Field>
          <Field label={t('medicines.nameEn')} error={form.formState.errors.name?.message}>
            <Input dir="ltr" {...form.register('name')} />
          </Field>
          <Field label={t('medicines.nameAr')}>
            <Input dir="rtl" {...form.register('nameAr')} />
          </Field>
          <Field label={t('medicines.scientificName')} className="col-span-2">
            <Input {...form.register('scientificName')} />
          </Field>
          <Field label={t('medicines.category')}>
            <Select {...form.register('categoryId')}>
              <option value="">—</option>
              {categories.data?.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('medicines.supplier')}>
            <Select {...form.register('supplierId')}>
              <option value="">—</option>
              {suppliers.data?.data.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('medicines.purchasePrice')} error={form.formState.errors.purchasePrice?.message}>
            <Input type="number" step="0.01" min={0} {...form.register('purchasePrice')} />
          </Field>
          <Field label={t('medicines.sellingPrice')} error={form.formState.errors.sellingPrice?.message}>
            <Input type="number" step="0.01" min={0} {...form.register('sellingPrice')} />
          </Field>
          <Field label={t('medicines.taxRate')}>
            <Input type="number" step="0.01" min={0} {...form.register('taxRate')} />
          </Field>
          <Field label={t('medicines.minStock')}>
            <Input type="number" min={0} {...form.register('minStock')} />
          </Field>
          <Field label={t('medicines.unit')}>
            <Input {...form.register('unit')} />
          </Field>
          <Field label={t('medicines.description')} className="col-span-2">
            <Textarea rows={2} {...form.register('description')} />
          </Field>
          <div className="col-span-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(batchTarget)}
        onClose={() => setBatchTarget(null)}
        title={`${t('medicines.addBatch')} — ${batchTarget?.name ?? ''}`}
      >
        <form
          onSubmit={batchForm.handleSubmit((values) => addBatch.mutate(values))}
          className="grid grid-cols-2 gap-3"
        >
          <div className="col-span-2">
            <ErrorText error={addBatch.error} />
          </div>
          <Field label={t('medicines.batchNumber')} error={batchForm.formState.errors.batchNumber?.message}>
            <Input dir="ltr" {...batchForm.register('batchNumber')} />
          </Field>
          <Field label={t('common.branch')} error={batchForm.formState.errors.branchId?.message}>
            <Select {...batchForm.register('branchId')}>
              {branches.data?.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('medicines.expiryDate')} error={batchForm.formState.errors.expiryDate?.message}>
            <Input type="date" {...batchForm.register('expiryDate')} />
          </Field>
          <Field label={t('medicines.manufacturingDate')}>
            <Input type="date" {...batchForm.register('manufacturingDate')} />
          </Field>
          <Field label={t('common.quantity')} error={batchForm.formState.errors.quantity?.message}>
            <Input type="number" min={0} {...batchForm.register('quantity')} />
          </Field>
          <Field label={t('medicines.costPrice')}>
            <Input type="number" step="0.01" min={0} {...batchForm.register('costPrice')} />
          </Field>
          <div className="col-span-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setBatchTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={addBatch.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Dialog>

      <BarcodeLabelsDialog target={labelTarget} onClose={() => setLabelTarget(null)} />
    </div>
  );
}
