import React, { useMemo, useState } from 'react';
import { collection, deleteDoc, doc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { CheckCircle2, ClipboardList, CreditCard, Search, Trash2, X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  formatCurrency,
  formatDateString,
  PAYMENT_METHOD_LABELS,
  WORK_ORDER_STATUS_META,
} from '../lib/formatters';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';
import { useToast } from '../components/Toast';
import {
  CashCategory,
  CashMovementType,
  PaymentMethod,
  StaffRole,
  WorkOrderStatus,
  type Prescription,
  type StaffUser,
  type WorkOrder,
} from '../types/optics';

interface WorkOrdersViewProps {
  currentUser: StaffUser;
  workOrders: WorkOrder[];
  prescriptions: Prescription[];
  loading: boolean;
  onGoToPos: () => void;
}

export function WorkOrdersView({
  currentUser,
  workOrders,
  prescriptions,
  loading,
  onGoToPos,
}: WorkOrdersViewProps) {
  const { notifySuccess, notifyError } = useToast();
  const [statusFilter, setStatusFilter] = useState<'all' | WorkOrderStatus>('all');
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);

  // Payment modal state inside drawer
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [busy, setBusy] = useState(false);
  const [deleteOrder, setDeleteOrder] = useState<WorkOrder | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canModify =
    currentUser.role === StaffRole.ADMIN || currentUser.role === StaffRole.VENDEDOR;
  const canDeleteOrder = (wo: WorkOrder) =>
    currentUser.role === StaffRole.ADMIN ||
    (currentUser.role === StaffRole.VENDEDOR && wo.status !== WorkOrderStatus.DELIVERED);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workOrders.filter((wo) => {
      if (statusFilter !== 'all' && wo.status !== statusFilter) return false;
      if (
        q &&
        !wo.orderNumber.toLowerCase().includes(q) &&
        !wo.patientName.toLowerCase().includes(q) &&
        !wo.labName.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [workOrders, statusFilter, search]);

  const linkedRx = useMemo(() => {
    if (!selectedOrder?.prescriptionId) return null;
    return prescriptions.find((rx) => rx.id === selectedOrder.prescriptionId) ?? null;
  }, [selectedOrder, prescriptions]);

  const handleAdvanceStatus = async (wo: WorkOrder, nextStatus: WorkOrderStatus) => {
    setBusy(true);
    try {
      await updateDoc(doc(db, 'workOrders', wo.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
      setSelectedOrder((prev) => (prev && prev.id === wo.id ? { ...prev, status: nextStatus } : prev));
      notifySuccess(`Orden ${wo.orderNumber} actualizada a "${WORK_ORDER_STATUS_META[nextStatus].label}".`);
    } catch (error) {
      notifyError('No se pudo actualizar el estado de la orden.');
      handleFirestoreError(error, OperationType.UPDATE, `workOrders/${wo.id}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSettleBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > selectedOrder.balanceDue) {
      notifyError('Ingresá un importe válido menor o igual al saldo pendiente.');
      return;
    }

    setBusy(true);
    try {
      const batch = writeBatch(db);
      const newPaid = selectedOrder.paidAmount + amount;
      const newBalance = Math.max(0, selectedOrder.totalAmount - newPaid);

      batch.update(doc(db, 'workOrders', selectedOrder.id), {
        paidAmount: newPaid,
        balanceDue: newBalance,
        status: selectedOrder.status,
        updatedAt: serverTimestamp(),
      });

      const cashRef = doc(collection(db, 'cashMovements'));
      batch.set(cashRef, {
        type: CashMovementType.INCOME,
        category: CashCategory.BALANCE_PAYMENT,
        amount,
        paymentMethod: payMethod,
        description: `Cobro saldo orden ${selectedOrder.orderNumber}`,
        workOrderId: selectedOrder.id,
        patientName: selectedOrder.patientName.slice(0, 120),
        userId: currentUser.uid,
        userName: currentUser.displayName.slice(0, 120),
        closed: false,
        createdAt: serverTimestamp(),
      });

      await batch.commit();
      setSelectedOrder((prev) =>
        prev ? { ...prev, paidAmount: newPaid, balanceDue: newBalance } : null
      );
      setPayAmount('');
      notifySuccess(`Pago de ${formatCurrency(amount)} registrado en caja.`);
    } catch (error) {
      notifyError('No se pudo registrar el cobro en caja.');
      handleFirestoreError(error, OperationType.WRITE, `workOrders/${selectedOrder.id}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteOrder = async () => {
    if (!deleteOrder || !canDeleteOrder(deleteOrder)) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'workOrders', deleteOrder.id));
      if (selectedOrder?.id === deleteOrder.id) {
        setSelectedOrder(null);
      }
      notifySuccess(`Orden de taller ${deleteOrder.orderNumber} eliminada.`);
      setDeleteOrder(null);
    } catch (error) {
      notifyError('No se pudo eliminar la orden de taller.');
      handleFirestoreError(error, OperationType.DELETE, `workOrders/${deleteOrder.id}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {(
            [
              { id: 'all', label: 'Todas' },
              { id: WorkOrderStatus.PENDING, label: 'Pendiente' },
              { id: WorkOrderStatus.IN_LAB, label: 'En laboratorio' },
              { id: WorkOrderStatus.QUALITY_CHECK, label: 'Control' },
              { id: WorkOrderStatus.READY, label: 'Listas' },
              { id: WorkOrderStatus.DELIVERED, label: 'Entregadas' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative lg:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar N° orden, paciente o lab..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F4C81]"
          />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            <div className="h-10 bg-slate-100 rounded animate-pulse" />
            <div className="h-10 bg-slate-100 rounded animate-pulse" />
            <div className="h-10 bg-slate-100 rounded animate-pulse" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <ClipboardList className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-900">No hay órdenes de trabajo</p>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Las órdenes se generan desde Mostrador y Caja al confirmar una venta o convertir un presupuesto.
            </p>
            {canModify && (
              <button
                type="button"
                onClick={onGoToPos}
                className="px-4 py-2 bg-[#0F4C81] hover:bg-[#0B3A63] text-white text-xs font-medium rounded-lg cursor-pointer"
              >
                Ir a Mostrador y Caja
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-3 px-4">Orden</th>
                  <th className="py-3 px-4">Paciente</th>
                  <th className="py-3 px-4">Detalle armazón y cristales</th>
                  <th className="py-3 px-4">Entrega</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-right">Saldo</th>
                  <th className="py-3 px-4 text-right">Gestión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filtered.map((wo) => {
                  const meta = WORK_ORDER_STATUS_META[wo.status];
                  return (
                    <tr key={wo.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                        {wo.orderNumber}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900">{wo.patientName}</p>
                        <p className="text-xs text-slate-500">{wo.labName}</p>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700 max-w-xs">
                        <p className="truncate font-medium text-slate-800">{wo.frameSummary || '—'}</p>
                        <p className="truncate text-slate-500">{wo.lensSummary || '—'}</p>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-700 whitespace-nowrap">
                        {formatDateString(wo.promisedDate)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`text-xs font-semibold ${meta.tone}`}>{meta.label}</span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs whitespace-nowrap">
                        <span
                          className={
                            wo.balanceDue > 0 ? 'font-semibold text-amber-700' : 'text-emerald-700 font-medium'
                          }
                        >
                          {wo.balanceDue > 0 ? formatCurrency(wo.balanceDue) : 'Saldada'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedOrder(wo);
                              setPayAmount(wo.balanceDue > 0 ? String(wo.balanceDue) : '');
                            }}
                            className="px-3 py-1.5 text-xs font-medium text-[#0F4C81] hover:bg-[#0F4C81]/10 rounded-lg transition-colors cursor-pointer"
                          >
                            Ver detalle
                          </button>
                          {canDeleteOrder(wo) && (
                            <button
                              type="button"
                              onClick={() => setDeleteOrder(wo)}
                              aria-label={`Eliminar orden ${wo.orderNumber}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Eliminar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Detalle de Orden */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Orden {selectedOrder.orderNumber} · {selectedOrder.patientName}
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedOrder.labName} · Prometida para {formatDateString(selectedOrder.promisedDate)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                aria-label="Cerrar"
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="border border-slate-200 rounded-lg p-4">
                  <p className="text-xs text-slate-500 mb-1">Armazón y cristales</p>
                  <p className="font-medium text-slate-900">{selectedOrder.frameSummary || '—'}</p>
                  <p className="text-slate-600 text-xs mt-1">{selectedOrder.lensSummary || '—'}</p>
                </div>
                <div className="border border-slate-200 rounded-lg p-4">
                  <p className="text-xs text-slate-500 mb-1">Estado económico</p>
                  <div className="space-y-1 font-mono tabular-nums text-xs">
                    <div className="flex justify-between">
                      <span className="font-sans text-slate-500">Total orden</span>
                      <span className="text-slate-900 font-medium">
                        {formatCurrency(selectedOrder.totalAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-sans text-slate-500">Abonado</span>
                      <span className="text-emerald-700">
                        {formatCurrency(selectedOrder.paidAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-slate-200">
                      <span className="font-sans font-semibold text-slate-900">Saldo pendiente</span>
                      <span className="font-semibold text-amber-700">
                        {formatCurrency(selectedOrder.balanceDue)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {linkedRx && (
                <div className="border border-slate-200 rounded-lg p-4">
                  <p className="text-xs font-semibold text-slate-900 mb-2">
                    Receta vinculada ({linkedRx.lensType})
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono tabular-nums text-xs text-slate-700">
                    <div>
                      <span className="font-sans font-semibold text-slate-900">OD: </span>
                      ESF {linkedRx.od.sphere} · CIL {linkedRx.od.cylinder} · EJE {linkedRx.od.axis}
                      {linkedRx.od.addition !== '—' ? ` · ADD ${linkedRx.od.addition}` : ''}
                      {linkedRx.od.pd && linkedRx.od.pd !== '—' ? ` · DNP ${linkedRx.od.pd}` : ''}
                      {linkedRx.od.height && linkedRx.od.height !== '—' ? ` · ALT ${linkedRx.od.height}` : ''}
                    </div>
                    <div>
                      <span className="font-sans font-semibold text-slate-900">OI: </span>
                      ESF {linkedRx.oi.sphere} · CIL {linkedRx.oi.cylinder} · EJE {linkedRx.oi.axis}
                      {linkedRx.oi.addition !== '—' ? ` · ADD ${linkedRx.oi.addition}` : ''}
                      {linkedRx.oi.pd && linkedRx.oi.pd !== '—' ? ` · DNP ${linkedRx.oi.pd}` : ''}
                      {linkedRx.oi.height && linkedRx.oi.height !== '—' ? ` · ALT ${linkedRx.oi.height}` : ''}
                    </div>
                  </div>
                </div>
              )}

              {selectedOrder.notes && (
                <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">
                  {selectedOrder.notes}
                </p>
              )}

              {canModify && selectedOrder.balanceDue > 0 && selectedOrder.status !== WorkOrderStatus.DELIVERED && (
                <form
                  onSubmit={handleSettleBalance}
                  className="border border-slate-200 rounded-lg p-4 space-y-3"
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                    <CreditCard className="w-4 h-4 text-[#0F4C81]" />
                    Registrar cobro de saldo en caja
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      type="number"
                      min={1}
                      max={selectedOrder.balanceDue}
                      step="1"
                      required
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      placeholder="Importe"
                      className="px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F4C81]"
                    />
                    <select
                      value={payMethod}
                      onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                      className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                    >
                      {Object.values(PaymentMethod).map((pm) => (
                        <option key={pm} value={pm}>
                          {PAYMENT_METHOD_LABELS[pm]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      disabled={busy}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-medium rounded-lg cursor-pointer"
                    >
                      Cobrar e ingresar a caja
                    </button>
                  </div>
                </form>
              )}

              <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <span className={`text-xs font-semibold ${WORK_ORDER_STATUS_META[selectedOrder.status].tone}`}>
                  Estado actual: {WORK_ORDER_STATUS_META[selectedOrder.status].label}
                </span>

                <div className="flex items-center gap-3">
                  {canDeleteOrder(selectedOrder) && (
                    <button
                      type="button"
                      disabled={busy || deleting}
                      onClick={() => setDeleteOrder(selectedOrder)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 border border-rose-200 hover:bg-rose-50 disabled:opacity-60 text-rose-700 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Eliminar orden
                    </button>
                  )}
                  {canModify && WORK_ORDER_STATUS_META[selectedOrder.status].next && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        handleAdvanceStatus(
                          selectedOrder,
                          WORK_ORDER_STATUS_META[selectedOrder.status].next!
                        )
                      }
                      className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F4C81] hover:bg-[#0B3A63] disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {WORK_ORDER_STATUS_META[selectedOrder.status].nextLabel}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        open={Boolean(deleteOrder)}
        title="Eliminar orden de taller"
        description={
          deleteOrder
            ? `Vas a eliminar la orden ${deleteOrder.orderNumber} de "${deleteOrder.patientName}". Esta acción no se puede deshacer.`
            : ''
        }
        busy={deleting}
        onCancel={() => !deleting && setDeleteOrder(null)}
        onConfirm={handleDeleteOrder}
      />
    </div>
  );
}
