import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Plus } from 'lucide-react';
import { AppShell } from './components/AppShell';
import { AuthGate } from './components/AuthGate';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OfflineIndicator } from './components/PWAInstallButton';
import { ToastProvider } from './components/Toast';
import { db, handleFirestoreError, OperationType } from './lib/firebase';
import { AppointmentsView } from './modules/AppointmentsView';
import { DashboardView } from './modules/DashboardView';
import { InventoryView } from './modules/InventoryView';
import { PatientsView } from './modules/PatientsView';
import { PosQuotesView } from './modules/PosQuotesView';
import { TeamView } from './modules/TeamView';
import { WorkOrdersView } from './modules/WorkOrdersView';
import {
  AppModule,
  StaffRole,
  type Appointment,
  type CashMovement,
  type InventoryItem,
  type Patient,
  type Prescription,
  type Quote,
  type StaffUser,
  type WorkOrder,
} from './types/optics';

function OpticsWorkspace({ currentUser }: { currentUser: StaffUser }) {
  const [activeModule, setActiveModule] = useState<AppModule>(AppModule.DASHBOARD);

  // Realtime collections
  const [patients, setPatients] = useState<Patient[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [cashMovements, setCashMovements] = useState<CashMovement[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Contextual modals & cross-module handoffs
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);
  const [patientModalOpen, setPatientModalOpen] = useState(false);
  const [inventoryModalOpen, setInventoryModalOpen] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [posPrefill, setPosPrefill] = useState<{
    patientId: string | null;
    prescriptionId: string | null;
  }>({ patientId: null, prescriptionId: null });

  const isSellerOrAdmin =
    currentUser.role === StaffRole.ADMIN || currentUser.role === StaffRole.VENDEDOR;
  const isAdmin = currentUser.role === StaffRole.ADMIN;

  useEffect(() => {
    setLoading(true);
    const unsubs: (() => void)[] = [];

    unsubs.push(
      onSnapshot(
        query(collection(db, 'patients'), orderBy('fullName', 'asc')),
        (snap) => {
          setPatients(
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Patient, 'id'>) }))
          );
          setLoading(false);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'patients')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'prescriptions'), orderBy('createdAt', 'desc')),
        (snap) => {
          setPrescriptions(
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Prescription, 'id'>) }))
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'prescriptions')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'appointments'), orderBy('scheduledAt', 'asc')),
        (snap) => {
          setAppointments(
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Appointment, 'id'>) }))
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'appointments')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'inventoryItems'), orderBy('brand', 'asc')),
        (snap) => {
          setInventoryItems(
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<InventoryItem, 'id'>) }))
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'inventoryItems')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'workOrders'), orderBy('createdAt', 'desc')),
        (snap) => {
          setWorkOrders(
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WorkOrder, 'id'>) }))
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'workOrders')
      )
    );

    if (isSellerOrAdmin) {
      unsubs.push(
        onSnapshot(
          query(collection(db, 'quotes'), orderBy('createdAt', 'desc')),
          (snap) => {
            setQuotes(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Quote, 'id'>) })));
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'quotes')
        )
      );

      unsubs.push(
        onSnapshot(
          query(collection(db, 'cashMovements'), orderBy('createdAt', 'desc')),
          (snap) => {
            setCashMovements(
              snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CashMovement, 'id'>) }))
            );
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'cashMovements')
        )
      );
    } else {
      setQuotes([]);
      setCashMovements([]);
    }

    if (isAdmin) {
      unsubs.push(
        onSnapshot(
          query(collection(db, 'staffUsers'), orderBy('displayName', 'asc')),
          (snap) => {
            setStaffUsers(
              snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StaffUser, 'id'>) }))
            );
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'staffUsers')
        )
      );
    } else {
      setStaffUsers([currentUser]);
    }

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [currentUser, isAdmin, isSellerOrAdmin]);

  const handleOpenPatientRx = (patientId: string) => {
    setSelectedPatientId(patientId);
    setActiveModule(AppModule.PATIENTS);
  };

  const handleCreateSaleForPatient = (patientId: string, prescriptionId?: string) => {
    setPosPrefill({ patientId, prescriptionId: prescriptionId ?? null });
    setActiveModule(AppModule.POS_CASH);
  };

  const renderPrimaryAction = () => {
    if (activeModule === AppModule.DASHBOARD) {
      if (isSellerOrAdmin) {
        return (
          <button
            type="button"
            onClick={() => {
              setPosPrefill({ patientId: null, prescriptionId: null });
              setActiveModule(AppModule.POS_CASH);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F4C81] hover:bg-[#0B3A63] text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Nueva venta / orden
          </button>
        );
      }
      return (
        <button
          type="button"
          onClick={() => {
            setActiveModule(AppModule.APPOINTMENTS);
            setAppointmentModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F4C81] hover:bg-[#0B3A63] text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Nuevo turno
        </button>
      );
    }

    if (activeModule === AppModule.APPOINTMENTS) {
      return (
        <button
          type="button"
          onClick={() => setAppointmentModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F4C81] hover:bg-[#0B3A63] text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Nuevo turno
        </button>
      );
    }

    if (activeModule === AppModule.PATIENTS) {
      return (
        <button
          type="button"
          onClick={() => setPatientModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F4C81] hover:bg-[#0B3A63] text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Nuevo paciente
        </button>
      );
    }

    if (activeModule === AppModule.WORK_ORDERS && isSellerOrAdmin) {
      return (
        <button
          type="button"
          onClick={() => setActiveModule(AppModule.POS_CASH)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F4C81] hover:bg-[#0B3A63] text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Nueva orden
        </button>
      );
    }

    if (activeModule === AppModule.INVENTORY && isAdmin) {
      return (
        <button
          type="button"
          onClick={() => setInventoryModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F4C81] hover:bg-[#0B3A63] text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Nuevo artículo
        </button>
      );
    }

    return undefined;
  };

  return (
    <AppShell
      currentUser={currentUser}
      activeModule={activeModule}
      onSelectModule={setActiveModule}
      primaryAction={renderPrimaryAction()}
    >
      {activeModule === AppModule.DASHBOARD && (
        <DashboardView
          currentUser={currentUser}
          patients={patients}
          appointments={appointments}
          workOrders={workOrders}
          inventoryItems={inventoryItems}
          cashMovements={cashMovements}
          loading={loading}
          onNavigate={setActiveModule}
        />
      )}

      {activeModule === AppModule.APPOINTMENTS && (
        <AppointmentsView
          currentUser={currentUser}
          appointments={appointments}
          patients={patients}
          staffUsers={staffUsers}
          loading={loading}
          onOpenPatientRx={handleOpenPatientRx}
          modalOpen={appointmentModalOpen}
          onSetModalOpen={setAppointmentModalOpen}
        />
      )}

      {activeModule === AppModule.PATIENTS && (
        <PatientsView
          currentUser={currentUser}
          patients={patients}
          prescriptions={prescriptions}
          loading={loading}
          selectedPatientId={selectedPatientId}
          onSelectPatientId={setSelectedPatientId}
          patientModalOpen={patientModalOpen}
          onSetPatientModalOpen={setPatientModalOpen}
          onCreateSaleForPatient={handleCreateSaleForPatient}
        />
      )}

      {activeModule === AppModule.WORK_ORDERS && (
        <WorkOrdersView
          currentUser={currentUser}
          workOrders={workOrders}
          prescriptions={prescriptions}
          loading={loading}
          onGoToPos={() => setActiveModule(AppModule.POS_CASH)}
        />
      )}

      {activeModule === AppModule.INVENTORY && (
        <InventoryView
          currentUser={currentUser}
          items={inventoryItems}
          loading={loading}
          modalOpen={inventoryModalOpen}
          onSetModalOpen={setInventoryModalOpen}
        />
      )}

      {activeModule === AppModule.POS_CASH && isSellerOrAdmin && (
        <PosQuotesView
          currentUser={currentUser}
          patients={patients}
          prescriptions={prescriptions}
          inventoryItems={inventoryItems}
          quotes={quotes}
          cashMovements={cashMovements}
          prefillPatientId={posPrefill.patientId}
          prefillPrescriptionId={posPrefill.prescriptionId}
          onOrderCreated={() => setActiveModule(AppModule.WORK_ORDERS)}
        />
      )}

      {activeModule === AppModule.TEAM && isAdmin && (
        <TeamView
          currentUser={currentUser}
          staffUsers={staffUsers}
          loading={loading}
        />
      )}
    </AppShell>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthGate>{(staffUser) => <OpticsWorkspace currentUser={staffUser} />}</AuthGate>
        <OfflineIndicator />
      </ToastProvider>
    </ErrorBoundary>
  );
}
