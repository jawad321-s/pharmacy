'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Pill } from 'lucide-react';
import { useAuth } from '@/stores/auth';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { ErrorText } from '@/components/ui/misc';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const { t } = useI18n();
  const router = useRouter();
  const login = useAuth((state) => state.login);
  const [error, setError] = useState<Error | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const user = await login(values.email, values.password);
      router.replace(user.platformRole ? '/admin' : '/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err : new Error(t('auth.invalidCredentials')));
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Pill className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-bold">{t('auth.loginTitle')}</h1>
        </div>
        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-lg border bg-card p-6 shadow-sm"
        >
          <ErrorText error={error} />
          <Field label={t('auth.email')} error={errors.email?.message}>
            <Input
              type="email"
              autoComplete="email"
              dir="ltr"
              {...register('email')}
            />
          </Field>
          <Field label={t('auth.password')} error={errors.password?.message}>
            <Input
              type="password"
              autoComplete="current-password"
              dir="ltr"
              {...register('password')}
            />
          </Field>
          <Button type="submit" className="w-full" loading={isSubmitting}>
            {t('auth.login')}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {t('auth.noAccount')}{' '}
            <Link href="/register" className="text-primary hover:underline">
              {t('auth.register')}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
