'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Pill } from 'lucide-react';
import { api, setTokens } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { ErrorText, Spinner } from '@/components/ui/misc';

const schema = z
  .object({
    pharmacyName: z.string().min(2).max(120),
    subdomain: z
      .string()
      .min(3)
      .max(40)
      .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, 'Lowercase letters, numbers and hyphens only'),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(8),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
type FormValues = z.infer<typeof schema>;

function RegisterForm() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const planSlug = searchParams.get('plan') ?? undefined;
  const [error, setError] = useState<Error | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const response = await api<{
        accessToken: string;
        refreshToken: string;
      }>('/auth/register', {
        method: 'POST',
        skipAuth: true,
        body: {
          pharmacyName: values.pharmacyName,
          subdomain: values.subdomain,
          firstName: values.firstName,
          lastName: values.lastName,
          email: values.email,
          password: values.password,
          planSlug,
        },
      });
      setTokens({
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
      });
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err : new Error(t('common.error')));
    }
  });

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-lg border bg-card p-6 shadow-sm"
    >
      <ErrorText error={error} />
      <Field label={t('auth.pharmacyName')} error={errors.pharmacyName?.message}>
        <Input {...register('pharmacyName')} />
      </Field>
      <Field label={t('auth.subdomain')} error={errors.subdomain?.message}>
        <div className="flex items-center gap-1" dir="ltr">
          <Input placeholder="alshifa" {...register('subdomain')} />
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            .pharmasaas.com
          </span>
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('auth.firstName')} error={errors.firstName?.message}>
          <Input {...register('firstName')} />
        </Field>
        <Field label={t('auth.lastName')} error={errors.lastName?.message}>
          <Input {...register('lastName')} />
        </Field>
      </div>
      <Field label={t('auth.email')} error={errors.email?.message}>
        <Input type="email" dir="ltr" autoComplete="email" {...register('email')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('auth.password')} error={errors.password?.message}>
          <Input type="password" dir="ltr" autoComplete="new-password" {...register('password')} />
        </Field>
        <Field
          label={t('auth.confirmPassword')}
          error={errors.confirmPassword?.message}
        >
          <Input type="password" dir="ltr" autoComplete="new-password" {...register('confirmPassword')} />
        </Field>
      </div>
      <Button type="submit" className="w-full" loading={isSubmitting}>
        {t('auth.register')}
      </Button>
      <p className="text-center text-xs text-muted-foreground">{t('auth.trialNote')}</p>
      <p className="text-center text-sm text-muted-foreground">
        {t('auth.haveAccount')}{' '}
        <Link href="/login" className="text-primary hover:underline">
          {t('auth.login')}
        </Link>
      </p>
    </form>
  );
}

export default function RegisterPage() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Pill className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-bold">{t('auth.registerTitle')}</h1>
        </div>
        <Suspense fallback={<Spinner />}>
          <RegisterForm />
        </Suspense>
      </div>
    </div>
  );
}
