'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  BarChart3,
  Bell,
  Building2,
  Calculator,
  CreditCard,
  FileClock,
  Globe,
  LayoutDashboard,
  LogOut,
  Moon,
  Package,
  Pill,
  Settings,
  ShoppingCart,
  Store,
  Sun,
  Truck,
  UserRound,
  Users,
} from 'lucide-react';
import { useAuth } from '@/stores/auth';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { Spinner } from '@/components/ui/misc';

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  permission?: string;
  platformOnly?: boolean;
}

interface NotificationItem {
  id: string;
  title: string;
  titleAr: string | null;
  body: string;
  bodyAr: string | null;
  readAt: string | null;
  createdAt: string;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, tenant, ready, hydrate, logout, hasPermission } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [dark, setDark] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    const stored = window.localStorage.getItem('pharmasaas.theme');
    const isDark = stored === 'dark';
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  useEffect(() => {
    const onLogout = () => router.replace('/login');
    window.addEventListener('pharmasaas:logout', onLogout);
    return () => window.removeEventListener('pharmasaas:logout', onLogout);
  }, [router]);

  useEffect(() => {
    if (ready && !user) {
      router.replace('/login');
    }
  }, [ready, user, router]);

  const unread = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: () => api<{ count: number }>('/notifications/unread-count'),
    enabled: Boolean(user),
    refetchInterval: 60_000,
  });

  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<NotificationItem[]>('/notifications'),
    enabled: Boolean(user) && showNotifications,
  });

  if (!ready || !user) {
    return <Spinner className="min-h-screen" />;
  }

  const isPlatform = Boolean(user.platformRole);
  const items: NavItem[] = isPlatform
    ? [
        { href: '/admin', label: t('nav.adminDashboard'), icon: <LayoutDashboard className="h-4 w-4" /> },
        { href: '/admin/tenants', label: t('nav.adminTenants'), icon: <Building2 className="h-4 w-4" /> },
      ]
    : [
        { href: '/dashboard', label: t('nav.dashboard'), icon: <LayoutDashboard className="h-4 w-4" />, permission: 'dashboard.view' },
        { href: '/pos', label: t('nav.pos'), icon: <ShoppingCart className="h-4 w-4" />, permission: 'pos.access' },
        { href: '/day-close', label: t('nav.dayClose'), icon: <Banknote className="h-4 w-4" />, permission: 'sales.view' },
        { href: '/medicines', label: t('nav.medicines'), icon: <Pill className="h-4 w-4" />, permission: 'medicines.view' },
        { href: '/inventory', label: t('nav.inventory'), icon: <Package className="h-4 w-4" />, permission: 'inventory.view' },
        { href: '/purchases', label: t('nav.purchases'), icon: <Truck className="h-4 w-4" />, permission: 'purchases.view' },
        { href: '/suppliers', label: t('nav.suppliers'), icon: <Store className="h-4 w-4" />, permission: 'suppliers.view' },
        { href: '/customers', label: t('nav.customers'), icon: <UserRound className="h-4 w-4" />, permission: 'customers.view' },
        { href: '/accounting', label: t('nav.accounting'), icon: <Calculator className="h-4 w-4" />, permission: 'accounting.view' },
        { href: '/reports', label: t('nav.reports'), icon: <BarChart3 className="h-4 w-4" />, permission: 'reports.view' },
        { href: '/users', label: t('nav.users'), icon: <Users className="h-4 w-4" />, permission: 'users.view' },
        { href: '/branches', label: t('nav.branches'), icon: <Building2 className="h-4 w-4" />, permission: 'branches.view' },
        { href: '/audit', label: t('nav.audit'), icon: <FileClock className="h-4 w-4" />, permission: 'audit.view' },
        { href: '/billing', label: t('nav.billing'), icon: <CreditCard className="h-4 w-4" />, permission: 'billing.manage' },
        { href: '/settings', label: t('nav.settings'), icon: <Settings className="h-4 w-4" />, permission: 'settings.manage' },
      ];

  const visible = items.filter(
    (item) => !item.permission || hasPermission(item.permission),
  );

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    window.localStorage.setItem('pharmasaas.theme', next ? 'dark' : 'light');
  };

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-e bg-card md:flex">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Pill className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">
              {tenant?.name ?? t('app.name')}
            </p>
            {tenant ? (
              <p className="truncate text-xs text-muted-foreground">
                {tenant.subdomain}
              </p>
            ) : null}
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {visible.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-2 border-b bg-card px-4">
          <div className="text-sm text-muted-foreground">
            {user.firstName} {user.lastName}
            {user.tenantRole ? (
              <span className="ms-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                {t(`users.${user.tenantRole}`)}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setLocale(locale === 'en' ? 'ar' : 'en')}
              className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent"
            >
              <Globe className="h-4 w-4" />
              {t('common.language')}
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-md p-2 text-muted-foreground hover:bg-accent"
              aria-label="Toggle theme"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowNotifications((v) => !v)}
                className="relative rounded-md p-2 text-muted-foreground hover:bg-accent"
                aria-label={t('notifications.title')}
              >
                <Bell className="h-4 w-4" />
                {(unread.data?.count ?? 0) > 0 ? (
                  <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                    {unread.data?.count}
                  </span>
                ) : null}
              </button>
              {showNotifications ? (
                <div className="absolute end-0 top-10 z-40 w-80 rounded-lg border bg-card shadow-lg">
                  <div className="flex items-center justify-between border-b px-3 py-2">
                    <p className="text-sm font-semibold">
                      {t('notifications.title')}
                    </p>
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={async () => {
                        await api('/notifications/read-all', { method: 'POST', body: {} });
                        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
                        void queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
                      }}
                    >
                      {t('notifications.markAllRead')}
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.data?.length ? (
                      notifications.data.map((item) => (
                        <div
                          key={item.id}
                          className={cn(
                            'border-b px-3 py-2 text-sm last:border-0',
                            !item.readAt && 'bg-primary/5',
                          )}
                        >
                          <p className="font-medium">
                            {locale === 'ar' && item.titleAr ? item.titleAr : item.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {locale === 'ar' && item.bodyAr ? item.bodyAr : item.body}
                          </p>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {formatDate(item.createdAt, locale, true)}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                        {t('notifications.empty')}
                      </p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={async () => {
                await logout();
                router.replace('/login');
              }}
              className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent"
            >
              <LogOut className="h-4 w-4" />
              {t('common.logout')}
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
