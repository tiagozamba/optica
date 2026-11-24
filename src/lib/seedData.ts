import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { plusDaysIsoDate, todayIsoDate } from './formatters';
import {
  AppointmentStatus,
  CashCategory,
  CashMovementType,
  InventoryCategory,
  LensType,
  PaymentMethod,
  QuoteStatus,
  StaffUser,
  WorkOrderStatus,
} from '../types/optics';

export async function seedInitialOpticalData(currentUser: StaffUser): Promise<void> {
  const batch = writeBatch(db);
  const now = serverTimestamp();
  const today = todayIsoDate();

  // 1. Pacientes
  const p1Ref = doc(collection(db, 'patients'));
  const p2Ref = doc(collection(db, 'patients'));
  const p3Ref = doc(collection(db, 'patients'));

  batch.set(p1Ref, {
    fullName: 'Lucía Fernández',
    dni: '34819204',
    phone: '+54 11 5842-1930',
    email: 'lucia.fernandez@correo.com',
    insuranceName: 'OSDE 310',
    notes: 'Prefiere armazones livianos de acetato o titanio. Sensible a reflejos nocturnos.',
    createdBy: currentUser.uid,
    createdAt: now,
    updatedAt: now,
  });

  batch.set(p2Ref, {
    fullName: 'Martín Echeverría',
    dni: '28405112',
    phone: '+54 11 4392-8814',
    email: 'martin.echeverria@correo.com',
    insuranceName: 'Swiss Medical',
    notes: 'Usuario habitual de lentes progresivos para oficina y conducción.',
    createdBy: currentUser.uid,
    createdAt: now,
    updatedAt: now,
  });

  batch.set(p3Ref, {
    fullName: 'Camila Soria',
    dni: '40129384',
    phone: '+54 11 6120-4409',
    email: 'camila.soria@correo.com',
    insuranceName: 'Particular',
    notes: 'Control anual de lentes de contacto tóricas.',
    createdBy: currentUser.uid,
    createdAt: now,
    updatedAt: now,
  });

  // 2. Recetas ópticas
  const rx1Ref = doc(collection(db, 'prescriptions'));
  const rx2Ref = doc(collection(db, 'prescriptions'));

  batch.set(rx1Ref, {
    patientId: p1Ref.id,
    patientName: 'Lucía Fernández',
    optometristId: currentUser.uid,
    optometristName: currentUser.displayName,
    examDate: today,
    lensType: LensType.MONOFOCAL,
    od: {
      sphere: '-1.75',
      cylinder: '-0.50',
      axis: '175°',
      addition: '—',
      pd: '31.5',
      height: '18.5',
      prism: '—',
    },
    oi: {
      sphere: '-2.00',
      cylinder: '-0.25',
      axis: '10°',
      addition: '—',
      pd: '31.5',
      height: '18.5',
      prism: '—',
    },
    notes: 'Se recomienda cristal orgánico 1.60 con antirreflejo multicapa y filtro azul.',
    createdAt: now,
    updatedAt: now,
  });

  batch.set(rx2Ref, {
    patientId: p2Ref.id,
    patientName: 'Martín Echeverría',
    optometristId: currentUser.uid,
    optometristName: currentUser.displayName,
    examDate: today,
    lensType: LensType.PROGRESIVO,
    od: {
      sphere: '+0.75',
      cylinder: '-0.75',
      axis: '90°',
      addition: '+2.00',
      pd: '32.0',
      height: '19.0',
      prism: '—',
    },
    oi: {
      sphere: '+1.00',
      cylinder: '-0.50',
      axis: '85°',
      addition: '+2.00',
      pd: '32.0',
      height: '19.0',
      prism: '—',
    },
    notes: 'Altura pupilar 19 mm en armazón elegido. Adaptación progresivo corredor corto.',
    createdAt: now,
    updatedAt: now,
  });

  // 3. Agenda de turnos
  const a1Ref = doc(collection(db, 'appointments'));
  const a2Ref = doc(collection(db, 'appointments'));
  const a3Ref = doc(collection(db, 'appointments'));

  batch.set(a1Ref, {
    patientId: p3Ref.id,
    patientName: 'Camila Soria',
    patientPhone: '+54 11 6120-4409',
    optometristName: currentUser.displayName,
    scheduledAt: `${today}T10:30`,
    reason: 'Adaptación lentes de contacto tóricas',
    status: AppointmentStatus.SCHEDULED,
    notes: 'Traer caja de solución habitual.',
    createdBy: currentUser.uid,
    createdAt: now,
    updatedAt: now,
  });

  batch.set(a2Ref, {
    patientId: p1Ref.id,
    patientName: 'Lucía Fernández',
    patientPhone: '+54 11 5842-1930',
    optometristName: currentUser.displayName,
    scheduledAt: `${today}T15:00`,
    reason: 'Control de agudeza visual y elección de armazón',
    status: AppointmentStatus.SCHEDULED,
    notes: '',
    createdBy: currentUser.uid,
    createdAt: now,
    updatedAt: now,
  });

  batch.set(a3Ref, {
    patientId: p2Ref.id,
    patientName: 'Martín Echeverría',
    patientPhone: '+54 11 4392-8814',
    optometristName: currentUser.displayName,
    scheduledAt: `${plusDaysIsoDate(1)}T11:00`,
    reason: 'Toma de altura pupilar y entrega de progresivos',
    status: AppointmentStatus.SCHEDULED,
    notes: '',
    createdBy: currentUser.uid,
    createdAt: now,
    updatedAt: now,
  });

  // 4. Inventario
  const inv1Ref = doc(collection(db, 'inventoryItems'));
  const inv2Ref = doc(collection(db, 'inventoryItems'));
  const inv3Ref = doc(collection(db, 'inventoryItems'));
  const inv4Ref = doc(collection(db, 'inventoryItems'));
  const inv5Ref = doc(collection(db, 'inventoryItems'));

  batch.set(inv1Ref, {
    sku: 'ARM-RAY-5154',
    category: InventoryCategory.FRAME,
    brand: 'Ray-Ban',
    model: 'Clubmaster Optics RX5154',
    specs: 'Calibre 51-21-145 · Carey / Dorado',
    costPrice: 95000,
    salePrice: 185000,
    stock: 6,
    minStock: 2,
    active: true,
    createdAt: now,
    updatedAt: now,
  });

  batch.set(inv2Ref, {
    sku: 'ARM-SIL-5541',
    category: InventoryCategory.FRAME,
    brand: 'Silhouette',
    model: 'TMA Minimal Art',
    specs: 'Titanio al aire · 52-17-140 · Plata mate',
    costPrice: 165000,
    salePrice: 310000,
    stock: 2,
    minStock: 3,
    active: true,
    createdAt: now,
    updatedAt: now,
  });

  batch.set(inv3Ref, {
    sku: 'CRI-ESS-160AR',
    category: InventoryCategory.LENS,
    brand: 'Essilor',
    model: 'Orgánico 1.60 Crizal Prevencia',
    specs: 'Par tallado · AR Multicapa + Filtro Azul',
    costPrice: 68000,
    salePrice: 142000,
    stock: 14,
    minStock: 4,
    active: true,
    createdAt: now,
    updatedAt: now,
  });

  batch.set(inv4Ref, {
    sku: 'CRI-ZEI-PROG',
    category: InventoryCategory.LENS,
    brand: 'Zeiss',
    model: 'Progressive Light D 1.67',
    specs: 'Progresivo digital · DuraVision Platinum',
    costPrice: 170000,
    salePrice: 345000,
    stock: 8,
    minStock: 2,
    active: true,
    createdAt: now,
    updatedAt: now,
  });

  batch.set(inv5Ref, {
    sku: 'LC-ACU-OASYS',
    category: InventoryCategory.CONTACT_LENS,
    brand: 'Acuvue',
    model: 'Oasys Hidraclear Plus (Caja x6)',
    specs: 'CB 8.4 · Diámetro 14.0 · Uso quincenal',
    costPrice: 34000,
    salePrice: 64000,
    stock: 1,
    minStock: 4,
    active: true,
    createdAt: now,
    updatedAt: now,
  });

  // 5. Presupuesto y Órdenes de trabajo
  const q1Ref = doc(collection(db, 'quotes'));
  batch.set(q1Ref, {
    quoteNumber: 'PRES-1041',
    patientId: p1Ref.id,
    patientName: 'Lucía Fernández',
    prescriptionId: rx1Ref.id,
    sellerId: currentUser.uid,
    sellerName: currentUser.displayName,
    items: [
      {
        inventoryItemId: inv1Ref.id,
        sku: 'ARM-RAY-5154',
        description: 'Ray-Ban Clubmaster Optics RX5154',
        quantity: 1,
        unitPrice: 185000,
        subtotal: 185000,
      },
      {
        inventoryItemId: inv3Ref.id,
        sku: 'CRI-ESS-160AR',
        description: 'Essilor Orgánico 1.60 Crizal Prevencia',
        quantity: 1,
        unitPrice: 142000,
        subtotal: 142000,
      },
    ],
    discount: 27000,
    totalAmount: 300000,
    status: QuoteStatus.SENT,
    notes: 'Incluye cobertura OSDE 310 aplicada sobre cristales.',
    createdAt: now,
    updatedAt: now,
  });

  const wo1Ref = doc(collection(db, 'workOrders'));
  batch.set(wo1Ref, {
    orderNumber: 'OT-2026-084',
    patientId: p2Ref.id,
    patientName: 'Martín Echeverría',
    prescriptionId: rx2Ref.id,
    quoteId: '',
    sellerId: currentUser.uid,
    sellerName: currentUser.displayName,
    labName: 'Laboratorio Central Zeiss',
    frameSummary: 'Silhouette TMA Minimal Art (Titanio)',
    lensSummary: 'Zeiss Progressive Light D 1.67 · DuraVision',
    promisedDate: plusDaysIsoDate(4),
    status: WorkOrderStatus.PENDING,
    totalAmount: 655000,
    paidAmount: 300000,
    balanceDue: 355000,
    notes: 'Verificar altura pupilar 19 mm antes de biselar.',
    createdAt: now,
    updatedAt: now,
  });

  const cm1Ref = doc(collection(db, 'cashMovements'));
  batch.set(cm1Ref, {
    type: CashMovementType.INCOME,
    category: CashCategory.SALE_DEPOSIT,
    amount: 300000,
    paymentMethod: PaymentMethod.TRANSFER,
    description: 'Seña inicial orden OT-2026-084 (Progresivos)',
    workOrderId: wo1Ref.id,
    patientName: 'Martín Echeverría',
    userId: currentUser.uid,
    userName: currentUser.displayName,
    closed: false,
    createdAt: now,
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'batch_seed');
  }
}
