import type { Timestamp } from 'firebase/firestore';
import {
  AppointmentStatus,
  CashCategory,
  InventoryCategory,
  PaymentMethod,
  QuoteStatus,
  StaffRole,
  WorkOrderStatus,
} from '../types/optics';

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatTimestamp(ts?: Timestamp | null): string {
  if (!ts) return '—';
  const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date();
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatDateTimeString(iso: string): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

export function formatDateString(iso: string): string {
  if (!iso) return '—';
  const parts = iso.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return iso;
}

export function sanitizeDni(raw: string): string {
  return raw.trim().replace(/\s+/g, '').replace(/[^a-zA-Z0-9.-]/g, '');
}

export function sanitizeSku(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '');
}

export function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function plusDaysIsoDate(days: number): string {
  const now = new Date();
  now.setDate(now.getDate() + days);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const ROLE_LABELS: Record<StaffRole, string> = {
  [StaffRole.ADMIN]: 'Administrador',
  [StaffRole.VENDEDOR]: 'Vendedor',
  [StaffRole.OPTOMETRA]: 'Optómetra',
  [StaffRole.PENDING]: 'Pendiente',
};

export const APPOINTMENT_STATUS_META: Record<AppointmentStatus, { label: string; tone: string }> = {
  [AppointmentStatus.SCHEDULED]: { label: 'Programado', tone: 'text-slate-700' },
  [AppointmentStatus.WAITING]: { label: 'En sala', tone: 'text-amber-700' },
  [AppointmentStatus.COMPLETED]: { label: 'Atendido', tone: 'text-emerald-700' },
  [AppointmentStatus.CANCELLED]: { label: 'Cancelado', tone: 'text-rose-700' },
};

export const INVENTORY_CATEGORY_LABELS: Record<InventoryCategory, string> = {
  [InventoryCategory.FRAME]: 'Armazón',
  [InventoryCategory.LENS]: 'Cristal',
  [InventoryCategory.CONTACT_LENS]: 'Lente de contacto',
  [InventoryCategory.ACCESSORY]: 'Accesorio',
};

export const WORK_ORDER_STATUS_META: Record<
  WorkOrderStatus,
  { label: string; tone: string; next?: WorkOrderStatus; nextLabel?: string }
> = {
  [WorkOrderStatus.PENDING]: {
    label: 'Pendiente',
    tone: 'text-slate-700',
    next: WorkOrderStatus.IN_LAB,
    nextLabel: 'Enviar a laboratorio',
  },
  [WorkOrderStatus.IN_LAB]: {
    label: 'En laboratorio',
    tone: 'text-amber-700',
    next: WorkOrderStatus.QUALITY_CHECK,
    nextLabel: 'Pasar a control',
  },
  [WorkOrderStatus.QUALITY_CHECK]: {
    label: 'Control de calidad',
    tone: 'text-[#0F4C81]',
    next: WorkOrderStatus.READY,
    nextLabel: 'Marcar lista para retirar',
  },
  [WorkOrderStatus.READY]: {
    label: 'Lista para retirar',
    tone: 'text-emerald-700',
    next: WorkOrderStatus.DELIVERED,
    nextLabel: 'Registrar entrega',
  },
  [WorkOrderStatus.DELIVERED]: {
    label: 'Entregada',
    tone: 'text-slate-500',
  },
};

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  [QuoteStatus.DRAFT]: 'Borrador',
  [QuoteStatus.SENT]: 'Enviado',
  [QuoteStatus.APPROVED]: 'Aprobado',
  [QuoteStatus.CONVERTED]: 'Convertido en orden',
  [QuoteStatus.EXPIRED]: 'Vencido',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]: 'Efectivo',
  [PaymentMethod.CARD]: 'Tarjeta',
  [PaymentMethod.TRANSFER]: 'Transferencia',
  [PaymentMethod.CURRENT_ACCOUNT]: 'Cuenta corriente',
};

export const CASH_CATEGORY_LABELS: Record<CashCategory, string> = {
  [CashCategory.SALE_DEPOSIT]: 'Seña de orden',
  [CashCategory.BALANCE_PAYMENT]: 'Cancelación de saldo',
  [CashCategory.DIRECT_SALE]: 'Venta directa',
  [CashCategory.SUPPLIER]: 'Pago a laboratorio / proveedor',
  [CashCategory.OPERATING_EXPENSE]: 'Gasto operativo',
  [CashCategory.DAILY_CLOSING]: 'Cierre de caja',
};
