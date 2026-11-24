import type { Timestamp } from 'firebase/firestore';

export enum StaffRole {
  PENDING = 'pending',
  ADMIN = 'admin',
  VENDEDOR = 'vendedor',
  OPTOMETRA = 'optometra',
}

export enum AppModule {
  DASHBOARD = 'dashboard',
  APPOINTMENTS = 'appointments',
  PATIENTS = 'patients',
  WORK_ORDERS = 'work_orders',
  INVENTORY = 'inventory',
  POS_CASH = 'pos_cash',
  TEAM = 'team',
}

export enum LensType {
  MONOFOCAL = 'Monofocal',
  BIFOCAL = 'Bifocal',
  PROGRESIVO = 'Progresivo',
  CONTACT_LENS = 'Lentes de Contacto',
  OCUPACIONAL = 'Ocupacional',
}

export enum AppointmentStatus {
  SCHEDULED = 'scheduled',
  WAITING = 'waiting',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum InventoryCategory {
  FRAME = 'frame',
  LENS = 'lens',
  CONTACT_LENS = 'contact_lens',
  ACCESSORY = 'accessory',
}

export enum QuoteStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  APPROVED = 'approved',
  CONVERTED = 'converted',
  EXPIRED = 'expired',
}

export enum WorkOrderStatus {
  PENDING = 'pending',
  IN_LAB = 'in_lab',
  QUALITY_CHECK = 'quality_check',
  READY = 'ready',
  DELIVERED = 'delivered',
}

export enum CashMovementType {
  INCOME = 'income',
  EXPENSE = 'expense',
  CLOSING = 'closing',
}

export enum CashCategory {
  SALE_DEPOSIT = 'sale_deposit',
  BALANCE_PAYMENT = 'balance_payment',
  DIRECT_SALE = 'direct_sale',
  SUPPLIER = 'supplier',
  OPERATING_EXPENSE = 'operating_expense',
  DAILY_CLOSING = 'daily_closing',
}

export enum PaymentMethod {
  CASH = 'cash',
  CARD = 'card',
  TRANSFER = 'transfer',
  CURRENT_ACCOUNT = 'current_account',
}

export interface StaffUser {
  id: string;
  uid: string;
  email: string;
  displayName: string;
  role: StaffRole;
  active: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Patient {
  id: string;
  fullName: string;
  dni: string;
  phone: string;
  email: string;
  insuranceName: string;
  notes: string;
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface EyeRx {
  sphere: string;
  cylinder: string;
  axis: string;
  addition: string;
  pd: string;
  height?: string;
  prism: string;
}

export interface Prescription {
  id: string;
  patientId: string;
  patientName: string;
  optometristId: string;
  optometristName: string;
  examDate: string;
  lensType: LensType;
  od: EyeRx;
  oi: EyeRx;
  notes: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  optometristName: string;
  scheduledAt: string;
  reason: string;
  status: AppointmentStatus;
  notes: string;
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface InventoryItem {
  id: string;
  sku: string;
  category: InventoryCategory;
  brand: string;
  model: string;
  specs: string;
  costPrice: number;
  salePrice: number;
  stock: number;
  minStock: number;
  active: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface QuoteItemLine {
  inventoryItemId: string;
  sku: string;
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface Quote {
  id: string;
  quoteNumber: string;
  patientId: string;
  patientName: string;
  prescriptionId: string;
  sellerId: string;
  sellerName: string;
  items: QuoteItemLine[];
  discount: number;
  totalAmount: number;
  status: QuoteStatus;
  notes: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface WorkOrder {
  id: string;
  orderNumber: string;
  patientId: string;
  patientName: string;
  prescriptionId: string;
  quoteId: string;
  sellerId: string;
  sellerName: string;
  labName: string;
  frameSummary: string;
  lensSummary: string;
  promisedDate: string;
  status: WorkOrderStatus;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  notes: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface CashMovement {
  id: string;
  type: CashMovementType;
  category: CashCategory;
  amount: number;
  paymentMethod: PaymentMethod;
  description: string;
  workOrderId: string;
  patientName: string;
  userId: string;
  userName: string;
  closed: boolean;
  createdAt?: Timestamp;
}

/**
 * Constantes de validación sincronizadas con firebase-blueprint.json
 */
export const BLUEPRINT_LIMITS = {
  DNI_PATTERN: /^[a-zA-Z0-9.-]+$/,
  SKU_PATTERN: /^[a-zA-Z0-9_-]+$/,
  ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
  MAX_NAME: 120,
  MAX_EMAIL: 180,
  MAX_PHONE: 32,
  MAX_NOTES_SHORT: 500,
  MAX_NOTES_LONG: 1000,
  MAX_SPECS: 160,
  MAX_QUOTE_ITEMS: 20,
} as const;
