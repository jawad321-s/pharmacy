'use client';

import { create } from 'zustand';

export interface CartItem {
  medicineId: string;
  name: string;
  nameAr: string | null;
  barcode: string;
  unitPrice: number;
  taxRate: number;
  quantity: number;
  discount: number;
  availableQuantity: number;
}

interface PosState {
  items: CartItem[];
  customerId: string | null;
  customerName: string | null;
  customerPoints: number;
  discountPercent: number;
  redeemPoints: number;
  addItem: (item: Omit<CartItem, 'quantity' | 'discount'>) => boolean;
  updateQuantity: (medicineId: string, quantity: number) => void;
  updateDiscount: (medicineId: string, discount: number) => void;
  removeItem: (medicineId: string) => void;
  setCustomer: (id: string | null, name: string | null, points: number) => void;
  setDiscountPercent: (value: number) => void;
  setRedeemPoints: (value: number) => void;
  clear: () => void;
  subtotal: () => number;
  taxTotal: () => number;
  grandTotal: (redeemValuePerPoint: number) => number;
}

export const usePos = create<PosState>((set, get) => ({
  items: [],
  customerId: null,
  customerName: null,
  customerPoints: 0,
  discountPercent: 0,
  redeemPoints: 0,

  addItem: (item) => {
    const existing = get().items.find((i) => i.medicineId === item.medicineId);
    if (existing) {
      if (existing.quantity + 1 > existing.availableQuantity) return false;
      set({
        items: get().items.map((i) =>
          i.medicineId === item.medicineId
            ? { ...i, quantity: i.quantity + 1 }
            : i,
        ),
      });
      return true;
    }
    if (item.availableQuantity < 1) return false;
    set({ items: [...get().items, { ...item, quantity: 1, discount: 0 }] });
    return true;
  },

  updateQuantity: (medicineId, quantity) => {
    set({
      items: get()
        .items.map((item) =>
          item.medicineId === medicineId
            ? {
                ...item,
                quantity: Math.max(
                  1,
                  Math.min(quantity, item.availableQuantity),
                ),
              }
            : item,
        )
        .filter((item) => item.quantity > 0),
    });
  },

  updateDiscount: (medicineId, discount) => {
    set({
      items: get().items.map((item) =>
        item.medicineId === medicineId
          ? {
              ...item,
              discount: Math.max(
                0,
                Math.min(discount, item.unitPrice * item.quantity),
              ),
            }
          : item,
      ),
    });
  },

  removeItem: (medicineId) => {
    set({ items: get().items.filter((item) => item.medicineId !== medicineId) });
  },

  setCustomer: (id, name, points) =>
    set({ customerId: id, customerName: name, customerPoints: points, redeemPoints: 0 }),

  setDiscountPercent: (value) =>
    set({ discountPercent: Math.max(0, Math.min(100, value)) }),

  setRedeemPoints: (value) =>
    set({ redeemPoints: Math.max(0, Math.min(value, get().customerPoints)) }),

  clear: () =>
    set({
      items: [],
      customerId: null,
      customerName: null,
      customerPoints: 0,
      discountPercent: 0,
      redeemPoints: 0,
    }),

  subtotal: () =>
    get().items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),

  taxTotal: () => {
    const { items, discountPercent } = get();
    return items.reduce((sum, item) => {
      const net =
        (item.unitPrice * item.quantity - item.discount) *
        (1 - discountPercent / 100);
      return sum + (net * item.taxRate) / 100;
    }, 0);
  },

  grandTotal: (redeemValuePerPoint) => {
    const state = get();
    const lineDiscounts = state.items.reduce((sum, item) => sum + item.discount, 0);
    const afterLineDiscount = state.subtotal() - lineDiscounts;
    const invoiceDiscount = (afterLineDiscount * state.discountPercent) / 100;
    return (
      afterLineDiscount -
      invoiceDiscount +
      state.taxTotal() -
      state.redeemPoints * redeemValuePerPoint
    );
  },
}));
