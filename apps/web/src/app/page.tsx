'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Calculator,
  Check,
  Globe,
  Package,
  Pill,
  ShoppingCart,
  Store,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Plan {
  id: string;
  slug: string;
  name: string;
  nameAr: string;
  description: string | null;
  priceMonthly: string;
  priceYearly: string;
  features: string[];
}

export default function LandingPage() {
  const { t, locale, setLocale } = useI18n();
  const plans = useQuery({
    queryKey: ['public-plans'],
    queryFn: () => api<Plan[]>('/subscriptions/plans', { skipAuth: true }),
  });

  const features = [
    { icon: <ShoppingCart className="h-5 w-5" />, title: t('landing.featurePos'), desc: t('landing.featurePosDesc') },
    { icon: <Package className="h-5 w-5" />, title: t('landing.featureInventory'), desc: t('landing.featureInventoryDesc') },
    { icon: <Calculator className="h-5 w-5" />, title: t('landing.featureAccounting'), desc: t('landing.featureAccountingDesc') },
    { icon: <Store className="h-5 w-5" />, title: t('landing.featureMultiBranch'), desc: t('landing.featureMultiBranchDesc') },
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Pill className="h-4 w-4" />
            </div>
            <span className="text-lg font-bold">{t('app.name')}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLocale(locale === 'en' ? 'ar' : 'en')}
              className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent"
            >
              <Globe className="h-4 w-4" />
              {t('common.language')}
            </button>
            <Link href="/login">
              <Button variant="outline">{t('landing.signIn')}</Button>
            </Link>
            <Link href="/register">
              <Button>{t('landing.startTrial')}</Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-20 text-center">
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight md:text-5xl">
          {t('landing.hero')}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          {t('landing.heroSub')}
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/register">
            <Button size="lg">{t('landing.startTrial')}</Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="outline">
              {t('landing.signIn')}
            </Button>
          </Link>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{t('auth.trialNote')}</p>
      </section>

      <section className="border-t bg-card py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-bold">{t('landing.features')}</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {features.map((feature) => (
              <div key={feature.title} className="rounded-lg border bg-background p-5">
                <div className="mb-3 inline-flex rounded-md bg-primary/10 p-2 text-primary">
                  {feature.icon}
                </div>
                <h3 className="font-semibold">{feature.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="text-center text-2xl font-bold">{t('landing.pricing')}</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {plans.data?.map((plan) => (
              <Card key={plan.id} className="flex flex-col">
                <CardHeader>
                  <CardTitle>{locale === 'ar' ? plan.nameAr : plan.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  <p className="num text-3xl font-extrabold">
                    ${Number(plan.priceMonthly)}
                    <span className="text-sm font-normal text-muted-foreground">
                      {t('billing.perMonth')}
                    </span>
                  </p>
                  <ul className="mt-4 flex-1 space-y-2 text-sm">
                    {(plan.features ?? []).map((feature) => (
                      <li key={feature} className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Link href={`/register?plan=${plan.slug}`} className="mt-6">
                    <Button className="w-full">{t('billing.subscribe')}</Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} {t('app.name')} — {t('app.tagline')}
      </footer>
    </div>
  );
}
