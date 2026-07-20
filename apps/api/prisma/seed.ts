/**
 * Demo seed data for PharmaSaaS.
 *
 * Creates: subscription plans, a platform super admin, and a fully
 * populated demo tenant (alshifa) with branches, users for every role,
 * categories, suppliers, customers, medicines with batches and stock,
 * purchases, sales and expenses.
 *
 * Run with: npm run db:seed
 */
import {
  BillingCycle,
  ExpenseCategory,
  LedgerAccount,
  LedgerSide,
  PaymentMethod,
  PlatformRole,
  PrismaClient,
  StockMovementType,
  SubscriptionStatus,
  TenantRole,
  TenantStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * DAY);
}

async function seedPlans() {
  const plans = [
    {
      slug: 'starter',
      name: 'Starter',
      nameAr: 'المبتدئ',
      description: 'For a single pharmacy getting started',
      priceMonthly: 29,
      priceYearly: 290,
      maxBranches: 1,
      maxUsers: 3,
      maxProducts: 1000,
      features: ['1 Branch', '3 Users', '1,000 Products', 'POS', 'Reports'],
      sortOrder: 0,
    },
    {
      slug: 'professional',
      name: 'Professional',
      nameAr: 'الاحترافي',
      description: 'For growing pharmacies and small chains',
      priceMonthly: 79,
      priceYearly: 790,
      maxBranches: 5,
      maxUsers: 20,
      maxProducts: -1,
      features: [
        '5 Branches',
        '20 Users',
        'Unlimited Products',
        'Branch Transfers',
        'Loyalty Program',
        'Priority Support',
      ],
      sortOrder: 1,
    },
    {
      slug: 'enterprise',
      name: 'Enterprise',
      nameAr: 'المؤسسات',
      description: 'For large pharmacy groups',
      priceMonthly: 199,
      priceYearly: 1990,
      maxBranches: -1,
      maxUsers: -1,
      maxProducts: -1,
      features: [
        'Unlimited Everything',
        'Dedicated Support',
        'Custom Integrations',
        'SLA',
      ],
      sortOrder: 2,
    },
  ];
  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      update: plan,
      create: plan,
    });
  }
  console.log('✓ Plans seeded');
}

async function seedPlatformAdmin(passwordHash: string) {
  await prisma.user.upsert({
    where: { email: 'admin@pharmasaas.com' },
    update: {},
    create: {
      email: 'admin@pharmasaas.com',
      passwordHash,
      firstName: 'Platform',
      lastName: 'Admin',
      platformRole: PlatformRole.SUPER_ADMIN,
    },
  });
  console.log('✓ Super admin seeded (admin@pharmasaas.com / Password123!)');
}

async function seedDemoTenant(passwordHash: string) {
  const existing = await prisma.tenant.findUnique({
    where: { subdomain: 'alshifa' },
  });
  if (existing) {
    console.log('✓ Demo tenant already exists, skipping');
    return;
  }

  const professional = await prisma.plan.findUniqueOrThrow({
    where: { slug: 'professional' },
  });

  const tenant = await prisma.tenant.create({
    data: {
      name: 'Al Shifa Pharmacy',
      slug: 'alshifa',
      subdomain: 'alshifa',
      email: 'owner@alshifa.com',
      phone: '+970599123456',
      address: 'Rukab Street, Ramallah, Palestine',
      currency: 'ILS',
      timezone: 'Asia/Hebron',
      status: TenantStatus.ACTIVE,
      subscriptionPlanId: professional.id,
      settings: {
        create: {
          taxRate: 16,
          receiptHeader: 'Al Shifa Pharmacy — صيدلية الشفاء',
          receiptFooter: 'Thank you for your visit — شكراً لزيارتكم',
          nearExpiryDays: 90,
          // 1 USD = 3.70 ₪, 1 JOD = 5.20 ₪ (edit under Settings → market rate)
          exchangeRates: { USD: 3.7, JOD: 5.2 },
        },
      },
    },
  });

  await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: professional.id,
      status: SubscriptionStatus.ACTIVE,
      billingCycle: BillingCycle.YEARLY,
      startsAt: daysFromNow(-30),
      endsAt: daysFromNow(335),
    },
  });

  const mainBranch = await prisma.branch.create({
    data: {
      tenantId: tenant.id,
      name: 'Main Branch',
      nameAr: 'الفرع الرئيسي',
      address: 'Rukab Street, Ramallah',
      phone: '+970599123456',
      isMain: true,
    },
  });
  const secondBranch = await prisma.branch.create({
    data: {
      tenantId: tenant.id,
      name: 'Al-Bireh Branch',
      nameAr: 'فرع البيرة',
      address: 'Al-Balou Street, Al-Bireh',
      phone: '+970599123457',
    },
  });

  const userDefs: { email: string; first: string; last: string; role: TenantRole; branchId?: string }[] = [
    { email: 'owner@alshifa.com', first: 'Ahmed', last: 'Hassan', role: TenantRole.OWNER },
    { email: 'manager@alshifa.com', first: 'Khalid', last: 'Omar', role: TenantRole.BRANCH_MANAGER, branchId: secondBranch.id },
    { email: 'pharmacist@alshifa.com', first: 'Sara', last: 'Ali', role: TenantRole.PHARMACIST, branchId: mainBranch.id },
    { email: 'cashier@alshifa.com', first: 'Fahad', last: 'Nasser', role: TenantRole.CASHIER, branchId: mainBranch.id },
    { email: 'inventory@alshifa.com', first: 'Noura', last: 'Saad', role: TenantRole.INVENTORY_MANAGER, branchId: mainBranch.id },
    { email: 'accountant@alshifa.com', first: 'Lina', last: 'Yousef', role: TenantRole.ACCOUNTANT },
  ];
  const users: Record<string, string> = {};
  for (const def of userDefs) {
    const user = await prisma.user.create({
      data: {
        email: def.email,
        passwordHash,
        firstName: def.first,
        lastName: def.last,
        tenantId: tenant.id,
        tenantRole: def.role,
        branchId: def.branchId ?? null,
      },
    });
    users[def.role] = user.id;
  }

  const categoriesData = [
    { name: 'Analgesics', nameAr: 'مسكنات الألم' },
    { name: 'Antibiotics', nameAr: 'المضادات الحيوية' },
    { name: 'Vitamins & Supplements', nameAr: 'الفيتامينات والمكملات' },
    { name: 'Cold & Flu', nameAr: 'البرد والإنفلونزا' },
    { name: 'Dermatology', nameAr: 'الأمراض الجلدية' },
    { name: 'Chronic Care', nameAr: 'الأمراض المزمنة' },
  ];
  const categories: Record<string, string> = {};
  for (const data of categoriesData) {
    const category = await prisma.category.create({
      data: { ...data, tenantId: tenant.id },
    });
    categories[data.name] = category.id;
  }

  const suppliersData = [
    { name: 'Jerusalem Pharmaceuticals (JEPHARM)', phone: '+970229001001', email: 'sales@jepharm.example' },
    { name: 'Birzeit Pharmaceutical Co', phone: '+970229001002', email: 'orders@birzeitpharma.example' },
    { name: 'Beit Jala Pharma Distribution', phone: '+970222001003', email: 'contact@bjpharma.example' },
  ];
  const suppliers: string[] = [];
  for (const data of suppliersData) {
    const supplier = await prisma.supplier.create({
      data: { ...data, tenantId: tenant.id },
    });
    suppliers.push(supplier.id);
  }

  const customersData = [
    { name: 'Mohammed Saleh', phone: '+970599200001' },
    { name: 'Fatima Abdullah', phone: '+970599200002' },
    { name: 'Omar Khalid', phone: '+970599200003' },
    { name: 'Aisha Rahman', phone: '+970599200004' },
  ];
  const customers: string[] = [];
  for (const data of customersData) {
    const customer = await prisma.customer.create({
      data: { ...data, tenantId: tenant.id },
    });
    customers.push(customer.id);
  }

  interface MedDef {
    barcode: string;
    name: string;
    nameAr: string;
    scientific: string;
    category: string;
    manufacturer: string;
    cost: number;
    price: number;
    batches: { number: string; expiryDays: number; qty: number; qty2?: number }[];
  }
  const meds: MedDef[] = [
    {
      barcode: '6221001000011', name: 'Panadol Extra 500mg', nameAr: 'بنادول اكسترا',
      scientific: 'Paracetamol + Caffeine', category: 'Analgesics', manufacturer: 'GSK',
      cost: 8.5, price: 12,
      batches: [
        { number: 'PAN-2601', expiryDays: 400, qty: 120, qty2: 60 },
        { number: 'PAN-2602', expiryDays: 70, qty: 40 },
      ],
    },
    {
      barcode: '6221001000028', name: 'Augmentin 1g', nameAr: 'أوجمنتين ١ جم',
      scientific: 'Amoxicillin + Clavulanic acid', category: 'Antibiotics', manufacturer: 'GSK',
      cost: 24, price: 34.5,
      batches: [{ number: 'AUG-2601', expiryDays: 300, qty: 80, qty2: 30 }],
    },
    {
      barcode: '6221001000035', name: 'Vitamin D3 5000 IU', nameAr: 'فيتامين د٣',
      scientific: 'Cholecalciferol', category: 'Vitamins & Supplements', manufacturer: 'NOW Foods',
      cost: 32, price: 45,
      batches: [{ number: 'VTD-2601', expiryDays: 600, qty: 150 }],
    },
    {
      barcode: '6221001000042', name: 'Fevadol Syrup 120ml', nameAr: 'فيفادول شراب',
      scientific: 'Paracetamol', category: 'Analgesics', manufacturer: 'SPIMACO',
      cost: 6, price: 9.25,
      batches: [
        { number: 'FEV-2601', expiryDays: 250, qty: 90 },
        { number: 'FEV-2602', expiryDays: 45, qty: 25 },
      ],
    },
    {
      barcode: '6221001000059', name: 'Zyrtec 10mg Tablets', nameAr: 'زيرتك أقراص',
      scientific: 'Cetirizine', category: 'Cold & Flu', manufacturer: 'UCB',
      cost: 14, price: 21,
      batches: [{ number: 'ZYR-2601', expiryDays: 500, qty: 70, qty2: 40 }],
    },
    {
      barcode: '6221001000066', name: 'Otrivin Nasal Spray', nameAr: 'أوتريفين بخاخ',
      scientific: 'Xylometazoline', category: 'Cold & Flu', manufacturer: 'GSK',
      cost: 11, price: 16.5,
      batches: [{ number: 'OTR-2601', expiryDays: 350, qty: 55 }],
    },
    {
      barcode: '6221001000073', name: 'Fucidin Cream 20g', nameAr: 'فيوسيدين كريم',
      scientific: 'Fusidic acid', category: 'Dermatology', manufacturer: 'LEO Pharma',
      cost: 16, price: 23,
      batches: [{ number: 'FUC-2601', expiryDays: 280, qty: 45 }],
    },
    {
      barcode: '6221001000080', name: 'Glucophage 850mg', nameAr: 'جلوكوفاج',
      scientific: 'Metformin', category: 'Chronic Care', manufacturer: 'Merck',
      cost: 12, price: 17.25,
      batches: [{ number: 'GLU-2601', expiryDays: 450, qty: 200, qty2: 80 }],
    },
    {
      barcode: '6221001000097', name: 'Concor 5mg', nameAr: 'كونكور',
      scientific: 'Bisoprolol', category: 'Chronic Care', manufacturer: 'Merck',
      cost: 19, price: 27.5,
      batches: [{ number: 'CON-2601', expiryDays: 380, qty: 65 }],
    },
    {
      barcode: '6221001000103', name: 'Omega-3 Fish Oil 1000mg', nameAr: 'أوميجا ٣',
      scientific: 'Omega-3 fatty acids', category: 'Vitamins & Supplements', manufacturer: 'Jamieson',
      cost: 38, price: 55,
      batches: [{ number: 'OMG-2601', expiryDays: 550, qty: 5 }],
    },
    {
      barcode: '6221001000110', name: 'Brufen 400mg', nameAr: 'بروفين',
      scientific: 'Ibuprofen', category: 'Analgesics', manufacturer: 'Abbott',
      cost: 7, price: 10.5,
      batches: [{ number: 'BRU-2601', expiryDays: -10, qty: 30 }, { number: 'BRU-2602', expiryDays: 320, qty: 110 }],
    },
    {
      barcode: '6221001000127', name: 'Ventolin Inhaler', nameAr: 'فنتولين بخاخ',
      scientific: 'Salbutamol', category: 'Chronic Care', manufacturer: 'GSK',
      cost: 15, price: 22,
      batches: [{ number: 'VEN-2601', expiryDays: 420, qty: 48 }],
    },
  ];

  let skuCounter = 1;
  for (const [index, med] of meds.entries()) {
    const medicine = await prisma.medicine.create({
      data: {
        tenantId: tenant.id,
        barcode: med.barcode,
        sku: `MED-${String(skuCounter).padStart(5, '0')}`,
        name: med.name,
        nameAr: med.nameAr,
        scientificName: med.scientific,
        manufacturer: med.manufacturer,
        categoryId: categories[med.category],
        supplierId: suppliers[index % suppliers.length],
        purchasePrice: med.cost,
        costPrice: med.cost,
        sellingPrice: med.price,
        taxRate: 16,
        unit: 'box',
        minStock: 15,
      },
    });
    skuCounter += 1;

    for (const batchDef of med.batches) {
      const batch = await prisma.batch.create({
        data: {
          tenantId: tenant.id,
          medicineId: medicine.id,
          batchNumber: batchDef.number,
          expiryDate: daysFromNow(batchDef.expiryDays),
          manufacturingDate: daysFromNow(batchDef.expiryDays - 730),
          costPrice: med.cost,
        },
      });
      const stocks: { branchId: string; qty: number }[] = [
        { branchId: mainBranch.id, qty: batchDef.qty },
      ];
      if (batchDef.qty2) {
        stocks.push({ branchId: secondBranch.id, qty: batchDef.qty2 });
      }
      for (const stock of stocks) {
        await prisma.stockItem.create({
          data: {
            tenantId: tenant.id,
            branchId: stock.branchId,
            batchId: batch.id,
            quantity: stock.qty,
          },
        });
        await prisma.stockMovement.create({
          data: {
            tenantId: tenant.id,
            branchId: stock.branchId,
            medicineId: medicine.id,
            batchId: batch.id,
            userId: users[TenantRole.INVENTORY_MANAGER],
            type: StockMovementType.PURCHASE,
            quantity: stock.qty,
            balanceAfter: stock.qty,
            reason: 'Opening stock',
          },
        });
      }
    }
  }
  console.log('✓ Medicines, batches and stock seeded');

  // Demo sales over the last 14 days
  const medicines = await prisma.medicine.findMany({
    where: { tenantId: tenant.id },
    include: {
      batches: {
        where: { expiryDate: { gt: new Date() } },
        orderBy: { expiryDate: 'asc' },
        include: { stockItems: { where: { branchId: mainBranch.id } } },
      },
    },
  });

  let saleSeq = 0;
  for (let day = 13; day >= 0; day -= 1) {
    const salesToday = 2 + ((day * 7) % 3);
    for (let s = 0; s < salesToday; s += 1) {
      const med = medicines[(day + s * 3) % medicines.length];
      const batch = med.batches.find(
        (b) => (b.stockItems[0]?.quantity ?? 0) > 3,
      );
      if (!batch) continue;
      const quantity = 1 + ((day + s) % 3);
      const stockItem = batch.stockItems[0];
      if (!stockItem || stockItem.quantity < quantity) continue;

      const unitPrice = Number(med.sellingPrice);
      const subtotal = unitPrice * quantity;
      const taxAmount = Math.round(subtotal * 0.16 * 100) / 100;
      const total = Math.round((subtotal + taxAmount) * 100) / 100;
      saleSeq += 1;
      const createdAt = new Date(Date.now() - day * DAY - s * 3600 * 1000);

      const sale = await prisma.sale.create({
        data: {
          tenantId: tenant.id,
          branchId: mainBranch.id,
          number: `INV-2026-${String(saleSeq).padStart(6, '0')}`,
          userId: users[TenantRole.CASHIER],
          customerId: s % 2 === 0 ? customers[(day + s) % customers.length] : null,
          subtotal,
          taxAmount,
          total,
          paidAmount: Math.ceil(total / 5) * 5,
          changeAmount: Math.round((Math.ceil(total / 5) * 5 - total) * 100) / 100,
          paymentMethod: s % 3 === 0 ? PaymentMethod.CREDIT_CARD : PaymentMethod.CASH,
          createdAt,
          items: {
            create: [
              {
                medicineId: med.id,
                quantity,
                unitPrice,
                costPrice: Number(med.costPrice),
                taxRate: 16,
                taxAmount,
                total,
                allocations: [{ batchId: batch.id, batchNumber: batch.batchNumber, quantity }],
              },
            ],
          },
        },
      });

      await prisma.stockItem.update({
        where: { id: stockItem.id },
        data: { quantity: { decrement: quantity } },
      });
      stockItem.quantity -= quantity;
      await prisma.stockMovement.create({
        data: {
          tenantId: tenant.id,
          branchId: mainBranch.id,
          medicineId: med.id,
          batchId: batch.id,
          userId: users[TenantRole.CASHIER],
          type: StockMovementType.SALE,
          quantity: -quantity,
          balanceAfter: stockItem.quantity,
          refType: 'sale',
          refId: sale.id,
          createdAt,
        },
      });
      await prisma.ledgerEntry.createMany({
        data: [
          {
            tenantId: tenant.id,
            account: LedgerAccount.CASH,
            side: LedgerSide.DEBIT,
            amount: total,
            description: `Sale ${sale.number}`,
            refType: 'sale',
            refId: sale.id,
            date: createdAt,
          },
          {
            tenantId: tenant.id,
            account: LedgerAccount.SALES_REVENUE,
            side: LedgerSide.CREDIT,
            amount: subtotal,
            description: `Sale ${sale.number}`,
            refType: 'sale',
            refId: sale.id,
            date: createdAt,
          },
          {
            tenantId: tenant.id,
            account: LedgerAccount.TAX_PAYABLE,
            side: LedgerSide.CREDIT,
            amount: taxAmount,
            description: `VAT on ${sale.number}`,
            refType: 'sale',
            refId: sale.id,
            date: createdAt,
          },
        ],
      });
    }
  }
  console.log(`✓ ${saleSeq} demo sales seeded`);

  const expensesData: { category: ExpenseCategory; amount: number; description: string; daysAgo: number }[] = [
    { category: ExpenseCategory.RENT, amount: 8000, description: 'Monthly rent — main branch', daysAgo: 12 },
    { category: ExpenseCategory.SALARIES, amount: 22000, description: 'Staff salaries', daysAgo: 10 },
    { category: ExpenseCategory.UTILITIES, amount: 1400, description: 'Electricity & water', daysAgo: 7 },
    { category: ExpenseCategory.MAINTENANCE, amount: 650, description: 'AC maintenance', daysAgo: 4 },
    { category: ExpenseCategory.MARKETING, amount: 1200, description: 'Social media campaign', daysAgo: 2 },
  ];
  for (const expense of expensesData) {
    const record = await prisma.expense.create({
      data: {
        tenantId: tenant.id,
        branchId: mainBranch.id,
        category: expense.category,
        amount: expense.amount,
        description: expense.description,
        date: daysFromNow(-expense.daysAgo),
        userId: users[TenantRole.ACCOUNTANT],
      },
    });
    await prisma.ledgerEntry.createMany({
      data: [
        {
          tenantId: tenant.id,
          account: LedgerAccount.EXPENSES,
          side: LedgerSide.DEBIT,
          amount: expense.amount,
          description: expense.description,
          refType: 'expense',
          refId: record.id,
          date: record.date,
        },
        {
          tenantId: tenant.id,
          account: LedgerAccount.CASH,
          side: LedgerSide.CREDIT,
          amount: expense.amount,
          description: expense.description,
          refType: 'expense',
          refId: record.id,
          date: record.date,
        },
      ],
    });
  }
  console.log('✓ Expenses seeded');
  console.log('\nDemo tenant ready: https://alshifa.<your-domain>');
  console.log('  owner@alshifa.com / Password123! (Owner)');
  console.log('  pharmacist@alshifa.com / Password123! (Pharmacist)');
  console.log('  cashier@alshifa.com / Password123! (Cashier)');
}

async function main() {
  const passwordHash = await bcrypt.hash('Password123!', 12);
  await seedPlans();
  await seedPlatformAdmin(passwordHash);
  await seedDemoTenant(passwordHash);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
