import { type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'bg-primary/10 text-primary',
        success: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
        warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
        destructive: 'bg-destructive/10 text-destructive',
        muted: 'bg-muted text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export function statusVariant(status: string): BadgeProps['variant'] {
  switch (status) {
    case 'ACTIVE':
    case 'COMPLETED':
    case 'PAID':
    case 'RECEIVED':
    case 'OK':
      return 'success';
    case 'TRIAL':
    case 'TRIALING':
    case 'PENDING':
    case 'IN_TRANSIT':
    case 'IN_PROGRESS':
    case 'PARTIALLY_RECEIVED':
    case 'PARTIALLY_REFUNDED':
    case 'LOW':
      return 'warning';
    case 'SUSPENDED':
    case 'CANCELLED':
    case 'VOID':
    case 'EXPIRED':
    case 'FAILED':
    case 'REFUNDED':
    case 'OUT':
      return 'destructive';
    default:
      return 'muted';
  }
}
