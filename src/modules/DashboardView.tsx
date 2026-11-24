import React, { useState } from 'react';
import { ArrowRight, CalendarClock, ClipboardCheck, Database, PackageMinus } from 'lucide-react';
import {
  APPOINTMENT_STATUS_META,
  formatCurrency,
  formatDateString,
  formatDateTimeString,
  todayIsoDate,
  WORK_ORDER_STATUS_META,
} from '../lib/formatters';
import { seedInitialOpticalData } from '../lib/seedData';
import { useToast } from '../components/Toast';
import {
  AppModule,
  AppointmentStatus,
  CashMovementType,
  StaffRole,
  WorkOrderStatus,
  type Appointment,
  type CashMovement,
  type InventoryItem,
  type Patient,
  type StaffUser,
  type WorkOrder,
} from '../types/optics';

interface DashboardViewProps {
  currentUser: StaffUser;
  patients: Patient[];
  appointments: Appointment[];
  workOrders: WorkOrder[];
  inventoryItems: InventoryItem[];
  cashMovements: CashMovement[];
  loading: boolean;
  onNavigate: (mod: AppModule) => void;
}

export function DashboardView({
  currentUser,
  patients,
  appointments,
  workOrders,
  inventoryItems,
  cashMovements,
  loading,
  onNavigate,
}: DashboardViewProps) {
  const { notifySuccess, notifyError } = useToast();
  const [seeding, setSeeding] = useState(false);

  const today = todayIsoDate();
  const todayAppointments = appointments
    .filter((a) => a.scheduledAt.startsWith(today) && a.status !== AppointmentStatus.CANCELLED)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  const readyOrders = workOrders.filter((w) => w.status === WorkOrderStatus.READY);
  const inLabCount = workOrders.filter(
    (w) =>
      w.status === WorkOrderStatus.PENDING ||
      w.status === WorkOrderStatus.IN_LAB ||
      w.status === WorkOrderStatus.QUALITY_CHECK
  ).length;

  const lowStockItems = inventoryItems.filter((item) => item.active && item.stock <= item.minStock);

  const openCashTotal = cashMovements
    .filter((m) => !m.closed && m.type !== CashMovementType.CLOSING)
    .reduce((acc, m) => (m.type === CashMovementType.INCOME ? acc + m.amount : acc - m.amount), 0);

  const isEmptyDatabase =
    !loading &&
    patients.length === 0 &&
    appointments.length === 0 &&
    inventoryItems.length === 0 &&
    workOrders.length === 0;

  const canViewCash =
    currentUser.role === StaffRole.ADMIN || currentUser.role === StaffRole.VENDEDOR;

  const handleSeedDemo = async () => {
    setSeeding(true);
    try {
      await seedInitialOpticalData(currentUser);
      notifySuccess('Datos iniciales de ejemplo cargados correctamente.');
    } catch {
      notifyError('No se pudieron cargar los datos de ejemplo.');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Bienvenida contextual */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1">
            Operación diaria · {formatDateString(today)}
          </p>
          <h2 className="font-display text-2xl font-semibold text-slate-900">
            Hola, {currentUser.displayName.split(' ')[0]}
          </h2>
        </div>

        {isEmptyDatabase && currentUser.role === StaffRole.ADMIN && (
          <button
            type="button"
            onClick={handleSeedDemo}
            disabled={seeding}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
          >
            <Database className="w-4 h-4 text-[#0F4C81]" />
            {seeding ? 'Cargando datos...' : 'Cargar datos de ejemplo'}
          </button>
        )}
      </div>

      {/* Franja KPI de 4 columnas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Turnos de hoy</p>
          <p className="font-mono tabular-nums text-2xl font-semibold text-slate-900 mt-2">
            {loading ? '—' : todayAppointments.length}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {todayAppointments.filter((a) => a.status === AppointmentStatus.WAITING).length} en sala de espera
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Órdenes en taller</p>
          <p className="font-mono tabular-nums text-2xl font-semibold text-slate-900 mt-2">
            {loading ? '—' : inLabCount}
          </p>
          <p className="text-xs text-emerald-700 mt-1 font-medium">
            {readyOrders.length} listas para retirar
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Alertas de stock</p>
          <p
            className={`font-mono tabular-nums text-2xl font-semibold mt-2 ${
              lowStockItems.length > 0 ? 'text-amber-700' : 'text-slate-900'
            }`}
          >
            {loading ? '—' : lowStockItems.length}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Sobre {inventoryItems.length} artículos activos
          </p>
        </div>

        {canViewCash ? (
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs font-medium text-slate-500">Caja abierta del turno</p>
            <p className="font-mono tabular-nums text-2xl font-semibold text-slate-900 mt-2">
              {loading ? '—' : formatCurrency(openCashTotal)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Saldo neto sin cierre
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs font-medium text-slate-500">Padrón de pacientes</p>
            <p className="font-mono tabular-nums text-2xl font-semibold text-slate-900 mt-2">
              {loading ? '—' : patients.length}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Historias clínicas registradas
            </p>
          </div>
        )}
      </div>

      {/* Grilla operativa principal */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Cola de turnos de hoy */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <CalendarClock className="w-4 h-4 text-[#0F4C81]" />
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Agenda de gabinete hoy
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate(AppModule.APPOINTMENTS)}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#0F4C81] hover:underline whitespace-nowrap cursor-pointer"
            >
              Ver agenda completa
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {loading ? (
            <div className="p-5 space-y-3">
              <div className="h-9 bg-slate-100 rounded animate-pulse" />
              <div className="h-9 bg-slate-100 rounded animate-pulse" />
              <div className="h-9 bg-slate-100 rounded animate-pulse" />
            </div>
          ) : todayAppointments.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-medium text-slate-800">No hay turnos agendados para hoy</p>
              <p className="text-xs text-slate-500 mt-1 mb-4">
                Registrá un nuevo turno para organizar la atención en gabinete.
              </p>
              <button
                type="button"
                onClick={() => onNavigate(AppModule.APPOINTMENTS)}
                className="px-4 py-2 bg-[#0F4C81] hover:bg-[#0B3A63] text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
              >
                Ir a Agenda
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {todayAppointments.slice(0, 6).map((appt) => {
                const statusMeta = APPOINTMENT_STATUS_META[appt.status];
                return (
                  <div
                    key={appt.id}
                    className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {appt.patientName}
                      </p>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {appt.reason} · {appt.optometristName}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono tabular-nums text-xs font-medium text-slate-900">
                        {formatDateTimeString(appt.scheduledAt).split(',')[1]?.trim() || appt.scheduledAt}
                      </p>
                      <p className={`text-xs font-medium mt-0.5 ${statusMeta.tone}`}>
                        {statusMeta.label}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Órdenes listas + Stock bajo */}
        <div className="lg:col-span-5 space-y-6">
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <ClipboardCheck className="w-4 h-4 text-emerald-700" />
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Órdenes listas para retirar
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigate(AppModule.WORK_ORDERS)}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#0F4C81] hover:underline whitespace-nowrap cursor-pointer"
              >
                Ver taller
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {readyOrders.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-xs text-slate-500">
                  No hay órdenes pendientes de retiro en este momento.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {readyOrders.slice(0, 4).map((wo) => (
                  <div key={wo.id} className="px-5 py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        <span className="font-mono text-xs text-slate-500 mr-2">{wo.orderNumber}</span>
                        {wo.patientName}
                      </p>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {WORK_ORDER_STATUS_META[wo.status].label} · {wo.frameSummary || wo.lensSummary}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono tabular-nums text-xs font-medium text-slate-900">
                        Saldo {formatCurrency(wo.balanceDue)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <PackageMinus className="w-4 h-4 text-amber-700" />
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Reposición sugerida
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigate(AppModule.INVENTORY)}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#0F4C81] hover:underline whitespace-nowrap cursor-pointer"
              >
                Ver stock
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {lowStockItems.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-xs text-slate-500">
                  Todo el inventario está por encima del mínimo definido.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {lowStockItems.slice(0, 4).map((item) => (
                  <div key={item.id} className="px-5 py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {item.brand} {item.model}
                      </p>
                      <p className="font-mono text-xs text-slate-500 truncate mt-0.5">
                        {item.sku} · Mínimo {item.minStock}
                      </p>
                    </div>
                    <span
                      className={`font-mono tabular-nums text-xs font-semibold shrink-0 ${
                        item.stock === 0 ? 'text-rose-700' : 'text-amber-700'
                      }`}
                    >
                      {item.stock} u.
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
