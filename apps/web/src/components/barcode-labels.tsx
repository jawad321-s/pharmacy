'use client';

import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Printer } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/stores/auth';
import { formatMoney } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';

export interface LabelTarget {
  name: string;
  nameAr: string | null;
  barcode: string;
  sellingPrice: string | number;
}

function Barcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, {
        format: 'CODE128',
        width: 1.4,
        height: 38,
        fontSize: 12,
        margin: 2,
        displayValue: true,
      });
    } catch {
      // invalid barcode content — render nothing rather than crash
    }
  }, [value]);
  return <svg ref={ref} className="w-full" />;
}

/**
 * Prints a sheet of adhesive barcode labels for a medicine. Each label
 * shows the pharmacy price, the medicine name and a Code128 barcode that
 * any USB scanner can read back at the POS.
 */
export function BarcodeLabelsDialog({
  target,
  onClose,
}: {
  target: LabelTarget | null;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const { tenant } = useAuth();
  const currency = tenant?.currency ?? 'ILS';
  const [count, setCount] = useState(12);

  if (!target) return null;
  const labels = Array.from({ length: Math.min(Math.max(count, 1), 200) });

  return (
    <Dialog
      open={Boolean(target)}
      onClose={onClose}
      title={`${t('medicines.printLabels')} — ${target.name}`}
      wide
    >
      <div className="space-y-3">
        <div className="flex items-end gap-3">
          <Field label={t('medicines.labelCount')} className="w-40">
            <Input
              type="number"
              min={1}
              max={200}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </Field>
          <Button
            onClick={() => {
              document.documentElement.classList.add('print-labels');
              window.print();
              document.documentElement.classList.remove('print-labels');
            }}
          >
            <Printer className="h-4 w-4" />
            {t('common.print')}
          </Button>
        </div>

        <div
          id="label-sheet"
          className="grid max-h-[60vh] grid-cols-3 gap-2 overflow-y-auto rounded-md border bg-white p-2"
        >
          {labels.map((_, index) => (
            <div
              key={index}
              className="flex flex-col items-center justify-center rounded border border-neutral-300 p-2 text-center text-black"
            >
              <p className="mb-0.5 line-clamp-1 text-[11px] font-semibold">
                {locale === 'ar' && target.nameAr ? target.nameAr : target.name}
              </p>
              <p className="num mb-1 text-xs font-bold">
                {formatMoney(target.sellingPrice, currency, locale)}
              </p>
              <Barcode value={target.barcode} />
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
