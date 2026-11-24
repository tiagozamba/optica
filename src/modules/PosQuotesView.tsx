import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { ArrowRightLeft, Lock, Plus, Trash2, X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  CASH_CATEGORY_LABELS,
  formatCurrency,
  formatTimestamp,
  PAYMENT_METHOD_LABELS,
  plusDaysIsoDate,
  QUOTE_STATUS_LABELS,
} from '../lib/formatters';
import { useToast } from '../components/Toast';
import {
  CashCategory,
  CashMovementType,
  InventoryCategory,
  PaymentMethod,
  QuoteStatus,
  WorkOrderStatus,
  type CashMovement,
  type InventoryItem,
  type Patient,
  type Prescription,
  type Quote,
  type QuoteItemLine,
  type StaffUser,
} from '../types/optics';

interface PosQuotesViewProps {
  currentUser: StaffUser;
  patients: Patient[];
  prescriptions: Prescription[];
  inventoryItems: InventoryItem[];
  quotes: Quote[];
  cashMovements: CashMovement[];
  prefillPatientId?: string | null;
  prefillPrescriptionId?: string | null;
  onOrderCreated: () => void;
}

type PosTab = 'builder' | 'quotes' | 'cash';

export function PosQuotesView({
  currentUser,
  patients,
  prescriptions,
  inventoryItems,
  quotes,
  cashMovements,
  prefillPatientId,
  prefillPrescriptionId,
  onOrderCreated,
}: PosQuotesViewProps) {
  const { notifySuccess, notifyError } = useToast();
  const [activeTab, setActiveTab] = useState<PosTab>('builder');

  // Sale / Quote Builder
  const [patientId, setPatientId] = useState('');
  const [prescriptionId, setPrescriptionId] = useState('');
  const [selectedInvId, setSelectedInvId] = useState('');
  const [lines, setLines] = useState<QuoteItemLine[]>([]);
  const [customDesc, setCustomDesc] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [discount, setDiscount] = useState('0');
  const [deposit, setDeposit] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [labName, setLabName] = useState('Laboratorio Central');
  const [promisedDate, setPromisedDate] = useState(plusDaysIsoDate(4));
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Manual cash movement modal
  const [cashModalOpen, setCashModalOpen] = useState(false);
  const [movType, setMovType] = useState<CashMovementType.INCOME | CashMovementType.EXPENSE>(
    CashMovementType.EXPENSE
  );
  const [movCategory, setMovCategory] = useState<CashCategory>(CashCategory.OPERATING_EXPENSE);
  const [movAmount, setMovAmount] = useState('');
  const [movMethod, setMovMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [movDesc, setMovDesc] = useState('');
  const [savingCash, setSavingCash] = useState(false);

  // Close register confirm
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [closingBusy, setClosingBusy] = useState(false);

  useEffect(() => {
    if (prefillPatientId) {
      setPatientId(prefillPatientId);
      setActiveTab('builder');
    }
    if (prefillPrescriptionId) {
      setPrescriptionId(prefillPrescriptionId);
    }
  }, [prefillPatientId, prefillPrescriptionId]);

  const patientPrescriptions = useMemo(
    () => prescriptions.filter((rx) => rx.patientId === patientId),
    [prescriptions, patientId]
  );

  const activeRx = useMemo(
    () => patientPrescriptions.find((rx) => rx.id === prescriptionId) ?? null,
    [patientPrescriptions, prescriptionId]
  );

  const subtotal = useMemo(() => lines.reduce((acc, l) => acc + l.subtotal, 0), [lines]);
  const discountNum = Math.max(0, Number(discount) || 0);
  const totalAmount = Math.max(0, subtotal - discountNum);
  const depositNum = Math.min(totalAmount, Math.max(0, Number(deposit) || 0));

  const addInventoryLine = () => {
    const item = inventoryItems.find((i) => i.id === selectedInvId);
    if (!item) return;
    if (lines.length >= 20) {
      notifyError('Máximo 20 ítems por presupuesto/orden.');
      return;
    }
    setLines((prev) => {
      const existingIdx = prev.findIndex((l) => l.inventoryItemId === item.id);
      if (existingIdx >= 0) {
        const next = [...prev];
        const qty = next[existingIdx].quantity + 1;
        next[existingIdx] = {
          ...next[existingIdx],
          quantity: qty,
          subtotal: qty * next[existingIdx].unitPrice,
        };
        return next;
      }
      return [
        ...prev,
        {
          inventoryItemId: item.id,
          sku: item.sku,
          description: `${item.brand} ${item.model}`,
          quantity: 1,
          unitPrice: item.salePrice,
          subtotal: item.salePrice,
        },
      ];
    });
    setSelectedInvId('');
  };

  const addCustomLine = () => {
    const price = Number(customPrice);
    if (customDesc.trim().length < 2 || !Number.isFinite(price) || price < 0) {
      notifyError('Ingresá una descripción y precio válido.');
      return;
    }
    if (lines.length >= 20) {
      notifyError('Máximo 20 ítems por presupuesto/orden.');
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        inventoryItemId: '',
        sku: 'SERV-OPT',
        description: customDesc.trim(),
        quantity: 1,
        unitPrice: price,
        subtotal: price,
      },
    ]);
    setCustomDesc('');
    setCustomPrice('');
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  const resetBuilder = () => {
    setLines([]);
    setDiscount('0');
    setDeposit('0');
    setNotes('');
  };

  const handleSaveQuote = async () => {
    const patient = patients.find((p) => p.id === patientId);
    if (!patient) {
      notifyError('Seleccioná un paciente para emitir el presupuesto.');
      return;
    }
    if (lines.length === 0) {
      notifyError('Agregá al menos un armazón, cristal o servicio.');
      return;
    }

    setSubmitting(true);
    try {
      const code = `PRES-${String(Date.now()).slice(-4)}`;
      await addDoc(collection(db, 'quotes'), {
        quoteNumber: code,
        patientId: patient.id,
        patientName: patient.fullName.slice(0, 120),
        prescriptionId: prescriptionId || '',
        sellerId: currentUser.uid,
        sellerName: currentUser.displayName.slice(0, 120),
        items: lines,
        discount: discountNum,
        totalAmount,
        status: QuoteStatus.SENT,
        notes: notes.trim().slice(0, 500),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      notifySuccess(`Presupuesto ${code} guardado.`);
      resetBuilder();
      setActiveTab('quotes');
    } catch (error) {
      notifyError('No se pudo guardar el presupuesto.');
      handleFirestoreError(error, OperationType.CREATE, 'quotes');
    } finally {
      setSubmitting(false);
    }
  };

  const createWorkOrderBatch = async (params: {
    patient: Patient;
    rxId: string;
    quoteId: string;
    orderLines: QuoteItemLine[];
    total: number;
    paid: number;
    method: PaymentMethod;
    orderNotes: string;
  }) => {
    const batch = writeBatch(db);
    const orderNumber = `OT-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
    const orderRef = doc(collection(db, 'workOrders'));

    const frameLines = params.orderLines.filter((l) => {
      const inv = inventoryItems.find((i) => i.id === l.inventoryItemId);
      return inv?.category === InventoryCategory.FRAME;
    });
    const lensLines = params.orderLines.filter((l) => {
      const inv = inventoryItems.find((i) => i.id === l.inventoryItemId);
      return inv?.category !== InventoryCategory.FRAME;
    });

    const frameSummary =
      frameLines.map((l) => l.description).join(' + ') ||
      params.orderLines[0]?.description ||
      'Armazón propio / Sin armazón';
    const lensSummary =
      lensLines.map((l) => l.description).join(' + ') || 'Según detalle de orden';

    batch.set(orderRef, {
      orderNumber,
      patientId: params.patient.id,
      patientName: params.patient.fullName.slice(0, 120),
      prescriptionId: params.rxId || '',
      quoteId: params.quoteId || '',
      sellerId: currentUser.uid,
      sellerName: currentUser.displayName.slice(0, 120),
      labName: (labName.trim() || 'Laboratorio Central').slice(0, 100),
      frameSummary: frameSummary.slice(0, 200),
      lensSummary: lensSummary.slice(0, 200),
      promisedDate: promisedDate.slice(0, 20),
      status: WorkOrderStatus.PENDING,
      totalAmount: params.total,
      paidAmount: params.paid,
      balanceDue: Math.max(0, params.total - params.paid),
      notes: params.orderNotes.trim().slice(0, 600),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Descontar stock de ítems del inventario
    const qtyByItem = new Map<string, number>();
    for (const line of params.orderLines) {
      if (line.inventoryItemId) {
        qtyByItem.set(
          line.inventoryItemId,
          (qtyByItem.get(line.inventoryItemId) ?? 0) + line.quantity
        );
      }
    }
    for (const [invId, decQty] of qtyByItem.entries()) {
      const inv = inventoryItems.find((i) => i.id === invId);
      if (inv) {
        batch.update(doc(db, 'inventoryItems', inv.id), {
          stock: Math.max(0, inv.stock - decQty),
          updatedAt: serverTimestamp(),
        });
      }
    }

    if (params.quoteId) {
      batch.update(doc(db, 'quotes', params.quoteId), {
        status: QuoteStatus.CONVERTED,
        updatedAt: serverTimestamp(),
      });
    }

    if (params.paid > 0) {
      const cashRef = doc(collection(db, 'cashMovements'));
      batch.set(cashRef, {
        type: CashMovementType.INCOME,
        category:
          params.paid >= params.total
            ? CashCategory.DIRECT_SALE
            : CashCategory.SALE_DEPOSIT,
        amount: params.paid,
        paymentMethod: params.method,
        description: `Pago orden ${orderNumber} (${params.patient.fullName})`,
        workOrderId: orderRef.id,
        patientName: params.patient.fullName.slice(0, 120),
        userId: currentUser.uid,
        userName: currentUser.displayName.slice(0, 120),
        closed: false,
        createdAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return orderNumber;
  };

  const handleConfirmDirectSale = async () => {
    const patient = patients.find((p) => p.id === patientId);
    if (!patient) {
      notifyError('Seleccioná un paciente para generar la orden.');
      return;
    }
    if (lines.length === 0) {
      notifyError('Agregá al menos un ítem para confirmar la venta.');
      return;
    }

    setSubmitting(true);
    try {
      const orderNumber = await createWorkOrderBatch({
        patient,
        rxId: prescriptionId,
        quoteId: '',
        orderLines: lines,
        total: totalAmount,
        paid: depositNum,
        method: paymentMethod,
        orderNotes: notes,
      });
      notifySuccess(`Orden ${orderNumber} creada, stock actualizado e ingreso registrado.`);
      resetBuilder();
      onOrderCreated();
    } catch (error) {
      notifyError('No se pudo confirmar la venta y orden de trabajo.');
      handleFirestoreError(error, OperationType.WRITE, 'workOrders');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConvertQuote = async (q: Quote) => {
    const patient = patients.find((p) => p.id === q.patientId);
    if (!patient) {
      notifyError('No se encontró la ficha del paciente asociado.');
      return;
    }
    setSubmitting(true);
    try {
      const orderNumber = await createWorkOrderBatch({
        patient,
        rxId: q.prescriptionId,
        quoteId: q.id,
        orderLines: q.items,
        total: q.totalAmount,
        paid: 0,
        method: PaymentMethod.CASH,
        orderNotes: `Convertido de presupuesto ${q.quoteNumber}. ${q.notes}`.trim(),
      });
      notifySuccess(`Presupuesto ${q.quoteNumber} convertido en orden ${orderNumber}.`);
      onOrderCreated();
    } catch (error) {
      notifyError('No se pudo convertir el presupuesto.');
      handleFirestoreError(error, OperationType.WRITE, `quotes/${q.id}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Caja Diaria cálculos
  const openMovements = useMemo(
    () => cashMovements.filter((m) => !m.closed && m.type !== CashMovementType.CLOSING),
    [cashMovements]
  );

  const openTotals = useMemo(() => {
    let income = 0;
    let expense = 0;
    const byMethod: Record<PaymentMethod, number> = {
      [PaymentMethod.CASH]: 0,
      [PaymentMethod.CARD]: 0,
      [PaymentMethod.TRANSFER]: 0,
      [PaymentMethod.CURRENT_ACCOUNT]: 0,
    };
    for (const m of openMovements) {
      if (m.type === CashMovementType.INCOME) {
        income += m.amount;
        byMethod[m.paymentMethod] += m.amount;
      } else if (m.type === CashMovementType.EXPENSE) {
        expense += m.amount;
        byMethod[m.paymentMethod] -= m.amount;
      }
    }
    return { income, expense, net: income - expense, byMethod };
  }, [openMovements]);

  const handleCreateCashMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(movAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      notifyError('Ingresá un monto mayor a cero.');
      return;
    }
    if (movDesc.trim().length < 2) {
      notifyError('Ingresá una descripción del movimiento.');
      return;
    }

    setSavingCash(true);
    try {
      await addDoc(collection(db, 'cashMovements'), {
        type: movType,
        category: movCategory,
        amount,
        paymentMethod: movMethod,
        description: movDesc.trim().slice(0, 240),
        workOrderId: '',
        patientName: '',
        userId: currentUser.uid,
        userName: currentUser.displayName.slice(0, 120),
        closed: false,
        createdAt: serverTimestamp(),
      });
      notifySuccess('Movimiento registrado en caja.');
      setMovAmount('');
      setMovDesc('');
      setCashModalOpen(false);
    } catch (error) {
      notifyError('No se pudo registrar el movimiento.');
      handleFirestoreError(error, OperationType.CREATE, 'cashMovements');
    } finally {
      setSavingCash(false);
    }
  };

  const handleCloseRegister = async () => {
    if (openMovements.length === 0) {
      setConfirmCloseOpen(false);
      return;
    }
    setClosingBusy(true);
    try {
      const batch = writeBatch(db);
      for (const m of openMovements) {
        batch.update(doc(db, 'cashMovements', m.id), { closed: true });
      }
      const closingRef = doc(collection(db, 'cashMovements'));
      batch.set(closingRef, {
        type: CashMovementType.CLOSING,
        category: CashCategory.DAILY_CLOSING,
        amount: Math.max(0, openTotals.net),
        paymentMethod: PaymentMethod.CASH,
        description: `Cierre de turno (${openMovements.length} movimientos · Neto ${formatCurrency(openTotals.net)})`,
        workOrderId: '',
        patientName: '',
        userId: currentUser.uid,
        userName: currentUser.displayName.slice(0, 120),
        closed: true,
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      setConfirmCloseOpen(false);
      notifySuccess('Turno de caja cerrado y archivado correctamente.');
    } catch (error) {
      notifyError('No se pudo cerrar el turno de caja.');
      handleFirestoreError(error, OperationType.WRITE, 'cashMovements');
    } finally {
      setClosingBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tabs de mostrador */}
      <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
        {(
          [
            { id: 'builder', label: 'Nueva venta / Presupuesto' },
            { id: 'quotes', label: `Presupuestos (${quotes.length})` },
            { id: 'cash', label: 'Caja diaria y arqueo' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: BUILDER */}
      {activeTab === 'builder' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 space-y-6">
            <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h3 className="font-display text-sm font-semibold text-slate-900">
                1. Paciente y receta óptica
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Paciente
                  </label>
                  <select
                    value={patientId}
                    onChange={(e) => {
                      setPatientId(e.target.value);
                      setPrescriptionId('');
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="">Seleccionar paciente...</option>
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.fullName} — DNI {p.dni}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Receta asociada (opcional)
                  </label>
                  <select
                    value={prescriptionId}
                    onChange={(e) => setPrescriptionId(e.target.value)}
                    disabled={!patientId}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white disabled:bg-slate-50"
                  >
                    <option value="">Sin receta / Venta directa</option>
                    {patientPrescriptions.map((rx) => (
                      <option key={rx.id} value={rx.id}>
                        {rx.examDate} · {rx.lensType} ({rx.optometristName})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {activeRx && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 font-mono tabular-nums text-xs text-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <span className="font-sans font-semibold">OD: </span>
                    ESF {activeRx.od.sphere} · CIL {activeRx.od.cylinder} · EJE {activeRx.od.axis}
                  </div>
                  <div>
                    <span className="font-sans font-semibold">OI: </span>
                    ESF {activeRx.oi.sphere} · CIL {activeRx.oi.cylinder} · EJE {activeRx.oi.axis}
                  </div>
                </div>
              )}
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <h3 className="font-display text-sm font-semibold text-slate-900">
                2. Armazón, cristales y servicios
              </h3>

              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  value={selectedInvId}
                  onChange={(e) => setSelectedInvId(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  <option value="">Elegir artículo de inventario...</option>
                  {inventoryItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      [{item.sku}] {item.brand} {item.model} — {formatCurrency(item.salePrice)} (Stock:{' '}
                      {item.stock})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addInventoryLine}
                  disabled={!selectedInvId}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-medium rounded-lg whitespace-nowrap cursor-pointer"
                >
                  Agregar del stock
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-slate-200">
                <input
                  type="text"
                  value={customDesc}
                  onChange={(e) => setCustomDesc(e.target.value)}
                  placeholder="Ítem manual (ej. Tallado especial / Tratamiento fotocromático)"
                  className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
                <input
                  type="number"
                  min={0}
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  placeholder="Precio"
                  className="sm:w-36 px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                />
                <button
                  type="button"
                  onClick={addCustomLine}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-medium rounded-lg whitespace-nowrap cursor-pointer"
                >
                  Agregar manual
                </button>
              </div>

              {lines.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center border border-dashed border-slate-200 rounded-lg">
                  Todavía no agregaste ítems al detalle.
                </p>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                        <th className="py-2.5 px-3">Descripción</th>
                        <th className="py-2.5 px-3 text-right">Cant.</th>
                        <th className="py-2.5 px-3 text-right">Unitario</th>
                        <th className="py-2.5 px-3 text-right">Subtotal</th>
                        <th className="py-2.5 px-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-sm">
                      {lines.map((line, idx) => (
                        <tr key={`${line.sku}-${idx}`}>
                          <td className="py-2.5 px-3">
                            <p className="font-medium text-slate-900">{line.description}</p>
                            <p className="font-mono text-xs text-slate-500">{line.sku}</p>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            {line.quantity}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            {formatCurrency(line.unitPrice)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-medium">
                            {formatCurrency(line.subtotal)}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              aria-label="Quitar ítem"
                              className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          {/* Resumen y cobro */}
          <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              3. Cierre económico y taller
            </h3>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-mono tabular-nums">{formatCurrency(subtotal)}</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Descuento / Cobertura obra social
                </label>
                <input
                  type="number"
                  min={0}
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                />
              </div>

              <div className="pt-2 border-t border-slate-200 flex justify-between items-baseline">
                <span className="font-semibold text-slate-900">Total final</span>
                <span className="font-mono tabular-nums text-xl font-semibold text-slate-900">
                  {formatCurrency(totalAmount)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Seña / Pago hoy
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={totalAmount}
                    value={deposit}
                    onChange={(e) => setDeposit(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Medio de pago
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {Object.values(PaymentMethod).map((pm) => (
                      <option key={pm} value={pm}>
                        {PAYMENT_METHOD_LABELS[pm]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Laboratorio
                  </label>
                  <input
                    type="text"
                    value={labName}
                    onChange={(e) => setLabName(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Fecha prometida
                  </label>
                  <input
                    type="date"
                    value={promisedDate}
                    onChange={(e) => setPromisedDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Notas</label>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div className="pt-2 space-y-2.5">
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmDirectSale}
                className="w-full py-2.5 px-4 bg-[#0F4C81] hover:bg-[#0B3A63] disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
              >
                {submitting ? 'Procesando...' : 'Confirmar venta y crear orden'}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSaveQuote}
                className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-sm font-medium rounded-lg transition-colors cursor-pointer"
              >
                Guardar como presupuesto
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* TAB 2: PRESUPUESTOS */}
      {activeTab === 'quotes' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {quotes.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm font-medium text-slate-900">No hay presupuestos emitidos</p>
              <p className="text-xs text-slate-500 mt-1">
                Armá un presupuesto desde la pestaña "Nueva venta / Presupuesto".
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="py-3 px-4">N°</th>
                    <th className="py-3 px-4">Paciente</th>
                    <th className="py-3 px-4">Detalle</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4 text-right">Total</th>
                    <th className="py-3 px-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {quotes.map((q) => (
                    <tr key={q.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900">
                        {q.quoteNumber}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900">{q.patientName}</p>
                        <p className="text-xs text-slate-500">Vendedor: {q.sellerName}</p>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 max-w-xs truncate">
                        {q.items.map((i) => i.description).join(' + ')}
                      </td>
                      <td className="py-3 px-4 text-xs font-medium text-slate-700">
                        {QUOTE_STATUS_LABELS[q.status]}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {formatCurrency(q.totalAmount)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {q.status !== QuoteStatus.CONVERTED && (
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => handleConvertQuote(q)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0F4C81] hover:bg-[#0B3A63] text-white text-xs font-medium rounded-lg cursor-pointer"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                            Convertir a orden
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: CAJA DIARIA */}
      {activeTab === 'cash' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500">Saldo neto turno abierto</p>
              <p className="font-mono tabular-nums text-2xl font-semibold text-slate-900 mt-1.5">
                {formatCurrency(openTotals.net)}
              </p>
              <p className="text-xs text-slate-500 mt-1">{openMovements.length} movimientos</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500">Efectivo en caja</p>
              <p className="font-mono tabular-nums text-2xl font-semibold text-emerald-700 mt-1.5">
                {formatCurrency(openTotals.byMethod[PaymentMethod.CASH])}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500">Tarjeta + Transferencia</p>
              <p className="font-mono tabular-nums text-2xl font-semibold text-slate-900 mt-1.5">
                {formatCurrency(
                  openTotals.byMethod[PaymentMethod.CARD] +
                    openTotals.byMethod[PaymentMethod.TRANSFER]
                )}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-3">
              <button
                type="button"
                onClick={() => setCashModalOpen(true)}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-medium rounded-lg cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Registrar ingreso / egreso
              </button>
              <button
                type="button"
                disabled={openMovements.length === 0}
                onClick={() => setConfirmCloseOpen(true)}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-medium rounded-lg cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                Cerrar turno de caja
              </button>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Libro diario de movimientos
              </h3>
              <span className="font-mono tabular-nums text-xs text-slate-500">
                {cashMovements.length} registros
              </span>
            </div>

            {cashMovements.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">
                Aún no se registraron movimientos de caja.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                      <th className="py-3 px-4">Fecha</th>
                      <th className="py-3 px-4">Concepto</th>
                      <th className="py-3 px-4">Categoría</th>
                      <th className="py-3 px-4">Medio</th>
                      <th className="py-3 px-4">Estado</th>
                      <th className="py-3 px-4 text-right">Importe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {cashMovements.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-600 whitespace-nowrap">
                          {formatTimestamp(m.createdAt)}
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-slate-900 font-medium">{m.description}</p>
                          <p className="text-xs text-slate-500">Operador: {m.userName}</p>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                          {CASH_CATEGORY_LABELS[m.category]}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                          {PAYMENT_METHOD_LABELS[m.paymentMethod]}
                        </td>
                        <td className="py-3 px-4 text-xs whitespace-nowrap">
                          {m.closed ? (
                            <span className="text-slate-500">Cerrado</span>
                          ) : (
                            <span className="text-emerald-700 font-medium">Turno abierto</span>
                          )}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                            m.type === CashMovementType.EXPENSE
                              ? 'text-rose-700'
                              : m.type === CashMovementType.CLOSING
                              ? 'text-[#0F4C81]'
                              : 'text-emerald-700'
                          }`}
                        >
                          {m.type === CashMovementType.EXPENSE ? '-' : ''}
                          {formatCurrency(m.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Movimiento Manual */}
      {cashModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Nuevo movimiento de caja
              </h3>
              <button
                type="button"
                onClick={() => setCashModalOpen(false)}
                aria-label="Cerrar"
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateCashMovement} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setMovType(CashMovementType.INCOME);
                    setMovCategory(CashCategory.DIRECT_SALE);
                  }}
                  className={`py-2 text-xs font-medium border rounded-lg cursor-pointer ${
                    movType === CashMovementType.INCOME
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  Ingreso
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMovType(CashMovementType.EXPENSE);
                    setMovCategory(CashCategory.OPERATING_EXPENSE);
                  }}
                  className={`py-2 text-xs font-medium border rounded-lg cursor-pointer ${
                    movType === CashMovementType.EXPENSE
                      ? 'bg-rose-50 border-rose-300 text-rose-800'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  Egreso
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Importe</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={movAmount}
                    onChange={(e) => setMovAmount(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Medio</label>
                  <select
                    value={movMethod}
                    onChange={(e) => setMovMethod(e.target.value as PaymentMethod)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {Object.values(PaymentMethod).map((pm) => (
                      <option key={pm} value={pm}>
                        {PAYMENT_METHOD_LABELS[pm]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Categoría</label>
                <select
                  value={movCategory}
                  onChange={(e) => setMovCategory(e.target.value as CashCategory)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  {movType === CashMovementType.INCOME ? (
                    <>
                      <option value={CashCategory.DIRECT_SALE}>Venta directa</option>
                      <option value={CashCategory.SALE_DEPOSIT}>Seña de orden</option>
                      <option value={CashCategory.BALANCE_PAYMENT}>Cancelación de saldo</option>
                    </>
                  ) : (
                    <>
                      <option value={CashCategory.OPERATING_EXPENSE}>Gasto operativo</option>
                      <option value={CashCategory.SUPPLIER}>Pago a laboratorio / proveedor</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Descripción</label>
                <input
                  type="text"
                  required
                  maxLength={240}
                  value={movDesc}
                  onChange={(e) => setMovDesc(e.target.value)}
                  placeholder="Ej. Pago cadetería laboratorio / Venta líquido limpiador"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCashModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingCash}
                  className="px-4 py-2 bg-[#0F4C81] text-white text-sm font-medium rounded-lg cursor-pointer"
                >
                  {savingCash ? 'Guardando...' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirmación Cierre de Caja */}
      {confirmCloseOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Confirmar cierre de turno de caja
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Se cerrarán <strong className="font-mono">{openMovements.length}</strong> movimientos
              abiertos con un saldo neto de{' '}
              <strong className="font-mono">{formatCurrency(openTotals.net)}</strong>. Los registros
              quedarán bloqueados como auditados.
            </p>
            <div className="pt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmCloseOpen(false)}
                className="px-4 py-2 text-sm text-slate-600 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={closingBusy}
                onClick={handleCloseRegister}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg cursor-pointer"
              >
                {closingBusy ? 'Cerrando...' : 'Confirmar cierre'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
