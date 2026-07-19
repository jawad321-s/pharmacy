import { BadRequestException } from '@nestjs/common';
import { StockMovementType } from '@prisma/client';
import { StockService, Tx } from './stock.service';
import { PrismaService } from '../../prisma/prisma.service';

interface MockStockItem {
  id: string;
  batchId: string;
  quantity: number;
  batch: {
    batchNumber: string;
    expiryDate: Date;
    costPrice: number;
    medicineId: string;
  };
}

function buildTx(items: MockStockItem[]) {
  const movements: unknown[] = [];
  const tx = {
    stockItem: {
      findMany: jest.fn(async ({ where }: { where: { batch: { expiryDate: { gt: Date } } } }) => {
        const now = where.batch.expiryDate.gt;
        return items
          .filter((item) => item.quantity > 0 && item.batch.expiryDate > now)
          .sort(
            (a, b) =>
              a.batch.expiryDate.getTime() - b.batch.expiryDate.getTime(),
          );
      }),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; quantity: { gte: number } };
          data: { quantity: { decrement: number } };
        }) => {
          const item = items.find((i) => i.id === where.id);
          if (!item || item.quantity < where.quantity.gte) {
            return { count: 0 };
          }
          item.quantity -= data.quantity.decrement;
          return { count: 1 };
        },
      ),
      findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }) => {
        const item = items.find((i) => i.id === where.id);
        if (!item) throw new Error('not found');
        return { quantity: item.quantity };
      }),
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
    stockMovement: {
      create: jest.fn(async ({ data }: { data: unknown }) => {
        movements.push(data);
        return data;
      }),
    },
  };
  return { tx: tx as unknown as Tx, movements, items };
}

describe('StockService — FEFO allocation', () => {
  let service: StockService;

  beforeEach(() => {
    service = new StockService({} as PrismaService);
  });

  const day = 24 * 60 * 60 * 1000;
  const future = (days: number) => new Date(Date.now() + days * day);

  it('allocates from the batch closest to expiry first (FEFO)', async () => {
    const { tx } = buildTx([
      {
        id: 'si-late',
        batchId: 'b-late',
        quantity: 100,
        batch: { batchNumber: 'LATE', expiryDate: future(300), costPrice: 10, medicineId: 'm1' },
      },
      {
        id: 'si-soon',
        batchId: 'b-soon',
        quantity: 5,
        batch: { batchNumber: 'SOON', expiryDate: future(30), costPrice: 9, medicineId: 'm1' },
      },
    ]);

    const allocations = await service.allocateFefo(
      tx,
      't1',
      'br1',
      'm1',
      8,
      { userId: 'u1' },
      StockMovementType.SALE,
    );

    expect(allocations).toHaveLength(2);
    expect(allocations[0].batchId).toBe('b-soon');
    expect(allocations[0].quantity).toBe(5);
    expect(allocations[1].batchId).toBe('b-late');
    expect(allocations[1].quantity).toBe(3);
  });

  it('never allocates expired batches', async () => {
    const { tx } = buildTx([
      {
        id: 'si-expired',
        batchId: 'b-expired',
        quantity: 50,
        batch: { batchNumber: 'EXP', expiryDate: future(-1), costPrice: 8, medicineId: 'm1' },
      },
      {
        id: 'si-ok',
        batchId: 'b-ok',
        quantity: 10,
        batch: { batchNumber: 'OK', expiryDate: future(200), costPrice: 8, medicineId: 'm1' },
      },
    ]);

    const allocations = await service.allocateFefo(
      tx,
      't1',
      'br1',
      'm1',
      10,
      {},
    );
    expect(allocations).toHaveLength(1);
    expect(allocations[0].batchId).toBe('b-ok');
  });

  it('rejects when usable stock is insufficient (prevents negative inventory)', async () => {
    const { tx } = buildTx([
      {
        id: 'si-1',
        batchId: 'b-1',
        quantity: 3,
        batch: { batchNumber: 'B1', expiryDate: future(100), costPrice: 8, medicineId: 'm1' },
      },
      {
        id: 'si-expired',
        batchId: 'b-2',
        quantity: 100,
        batch: { batchNumber: 'B2', expiryDate: future(-5), costPrice: 8, medicineId: 'm1' },
      },
    ]);

    await expect(
      service.allocateFefo(tx, 't1', 'br1', 'm1', 4, {}),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects non-positive quantities', async () => {
    const { tx } = buildTx([]);
    await expect(service.allocateFefo(tx, 't1', 'br1', 'm1', 0, {})).rejects.toThrow(
      BadRequestException,
    );
  });

  it('records a movement per touched batch with negative quantity', async () => {
    const { tx, movements } = buildTx([
      {
        id: 'si-a',
        batchId: 'b-a',
        quantity: 4,
        batch: { batchNumber: 'A', expiryDate: future(10), costPrice: 5, medicineId: 'm1' },
      },
      {
        id: 'si-b',
        batchId: 'b-b',
        quantity: 4,
        batch: { batchNumber: 'B', expiryDate: future(20), costPrice: 5, medicineId: 'm1' },
      },
    ]);

    await service.allocateFefo(tx, 't1', 'br1', 'm1', 6, { refType: 'sale', refId: 's1' });
    expect(movements).toHaveLength(2);
    expect(movements[0]).toMatchObject({
      batchId: 'b-a',
      quantity: -4,
      refType: 'sale',
      refId: 's1',
    });
    expect(movements[1]).toMatchObject({ batchId: 'b-b', quantity: -2 });
  });
});
