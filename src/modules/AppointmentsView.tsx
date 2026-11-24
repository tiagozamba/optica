import React, { useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Calendar, FilePlus2, Plus, Search, Trash2, X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { APPOINTMENT_STATUS_META, formatDateTimeString, todayIsoDate } from '../lib/formatters';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';
import { useToast } from '../components/Toast';
import {
  AppointmentStatus,
  StaffRole,
  type Appointment,
  type Patient,
  type StaffUser,
} from '../types/optics';

interface AppointmentsViewProps {
  currentUser: StaffUser;
  appointments: Appointment[];
  patients: Patient[];
  staffUsers: StaffUser[];
  loading: boolean;
  onOpenPatientRx: (patientId: string) => void;
  modalOpen: boolean;
  onSetModalOpen: (open: boolean) => void;
}

export function AppointmentsView({
  currentUser,
  appointments,
  patients,
  staffUsers,
  loading,
  onOpenPatientRx,
  modalOpen,
  onSetModalOpen,
}: AppointmentsViewProps) {
  const { notifySuccess, notifyError } = useToast();
  const [statusFilter, setStatusFilter] = useState<'all' | AppointmentStatus>('all');
  const [dateFilter, setDateFilter] = useState<string>(todayIsoDate());
  const [showAllDates, setShowAllDates] = useState(true);
  const [search, setSearch] = useState('');

  // Form state
  const [patientId, setPatientId] = useState('');
  const [optometristName, setOptometristName] = useState(currentUser.displayName);
  const [scheduledAt, setScheduledAt] = useState(`${todayIsoDate()}T10:00`);
  const [reason, setReason] = useState('Examen visual completo');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteAppt, setDeleteAppt] = useState<Appointment | null>(null);
  const [deleting, setDeleting] = useState(false);

  const optometrists = useMemo(() => {
    const activeOps = staffUsers.filter(
      (u) => u.active && (u.role === StaffRole.OPTOMETRA || u.role === StaffRole.ADMIN)
    );
    return activeOps.length > 0 ? activeOps : [currentUser];
  }, [staffUsers, currentUser]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return appointments
      .filter((appt) => {
        if (statusFilter !== 'all' && appt.status !== statusFilter) return false;
        if (!showAllDates && dateFilter && !appt.scheduledAt.startsWith(dateFilter)) return false;
        if (
          q &&
          !appt.patientName.toLowerCase().includes(q) &&
          !appt.reason.toLowerCase().includes(q) &&
          !appt.optometristName.toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }, [appointments, statusFilter, dateFilter, showAllDates, search]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const patient = patients.find((p) => p.id === patientId);
    if (!patient) {
      notifyError('Seleccioná un paciente registrado para agendar el turno.');
      return;
    }
    if (reason.trim().length < 2) {
      notifyError('Indicá el motivo de la consulta.');
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'appointments'), {
        patientId: patient.id,
        patientName: patient.fullName.slice(0, 120),
        patientPhone: patient.phone.slice(0, 32),
        optometristName: optometristName.trim().slice(0, 120),
        scheduledAt: scheduledAt.slice(0, 32),
        reason: reason.trim().slice(0, 160),
        status: AppointmentStatus.SCHEDULED,
        notes: notes.trim().slice(0, 500),
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      notifySuccess(`Turno agendado para ${patient.fullName}.`);
      setPatientId('');
      setNotes('');
      onSetModalOpen(false);
    } catch (error) {
      notifyError('No se pudo guardar el turno.');
      handleFirestoreError(error, OperationType.CREATE, 'appointments');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (appt: Appointment, nextStatus: AppointmentStatus) => {
    try {
      await updateDoc(doc(db, 'appointments', appt.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
      notifySuccess(`Turno actualizado a "${APPOINTMENT_STATUS_META[nextStatus].label}".`);
    } catch (error) {
      notifyError('No se pudo actualizar el estado del turno.');
      handleFirestoreError(error, OperationType.UPDATE, `appointments/${appt.id}`);
    }
  };

  const handleDeleteAppointment = async () => {
    if (!deleteAppt) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'appointments', deleteAppt.id));
      notifySuccess(`Turno de ${deleteAppt.patientName} eliminado.`);
      setDeleteAppt(null);
    } catch (error) {
      notifyError('No se pudo eliminar el turno.');
      handleFirestoreError(error, OperationType.DELETE, `appointments/${deleteAppt.id}`);
    } finally {
      setDeleting(false);
    }
  };

  const canCreateRx =
    currentUser.role === StaffRole.ADMIN || currentUser.role === StaffRole.OPTOMETRA;

  return (
    <div className="space-y-6">
      {/* Barra de filtros */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {(
            [
              { id: 'all', label: 'Todos' },
              { id: AppointmentStatus.SCHEDULED, label: 'Programados' },
              { id: AppointmentStatus.WAITING, label: 'En sala' },
              { id: AppointmentStatus.COMPLETED, label: 'Atendidos' },
              { id: AppointmentStatus.CANCELLED, label: 'Cancelados' },
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

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setShowAllDates((prev) => !prev)}
              className={`px-3 py-2 border rounded-lg font-medium transition-colors whitespace-nowrap cursor-pointer ${
                showAllDates
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {showAllDates ? 'Todas las fechas' : 'Filtrar por fecha'}
            </button>
            {!showAllDates && (
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 bg-white"
              />
            )}
          </div>

          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar paciente o motivo..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F4C81]"
            />
          </div>
        </div>
      </div>

      {/* Tabla de turnos */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            <div className="h-10 bg-slate-100 rounded animate-pulse" />
            <div className="h-10 bg-slate-100 rounded animate-pulse" />
            <div className="h-10 bg-slate-100 rounded animate-pulse" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-900">No hay turnos para este filtro</p>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              {patients.length === 0
                ? 'Primero registrá un paciente en Pacientes y Recetas para asignarle un turno.'
                : 'Agendá un nuevo turno de examen visual o control de lentes.'}
            </p>
            {patients.length > 0 && (
              <button
                type="button"
                onClick={() => onSetModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F4C81] hover:bg-[#0B3A63] text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Nuevo turno
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-3 px-4">Fecha y hora</th>
                  <th className="py-3 px-4">Paciente</th>
                  <th className="py-3 px-4">Motivo</th>
                  <th className="py-3 px-4">Optómetra</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filtered.map((appt) => {
                  const meta = APPOINTMENT_STATUS_META[appt.status];
                  const isTerminal =
                    appt.status === AppointmentStatus.COMPLETED ||
                    appt.status === AppointmentStatus.CANCELLED;
                  return (
                    <tr key={appt.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-800 whitespace-nowrap">
                        {formatDateTimeString(appt.scheduledAt)}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900">{appt.patientName}</p>
                        <p className="font-mono text-xs text-slate-500">{appt.patientPhone}</p>
                      </td>
                      <td className="py-3 px-4 text-slate-700 max-w-xs">
                        <p className="truncate">{appt.reason}</p>
                        {appt.notes && (
                          <p className="text-xs text-slate-500 truncate">{appt.notes}</p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                        {appt.optometristName}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`text-xs font-semibold ${meta.tone}`}>{meta.label}</span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          {appt.status === AppointmentStatus.SCHEDULED && (
                            <button
                              type="button"
                              onClick={() => handleStatusChange(appt, AppointmentStatus.WAITING)}
                              className="px-2.5 py-1 text-xs font-medium border border-amber-300 text-amber-800 hover:bg-amber-50 rounded-md transition-colors cursor-pointer"
                            >
                              Pasar a sala
                            </button>
                          )}
                          {(appt.status === AppointmentStatus.SCHEDULED ||
                            appt.status === AppointmentStatus.WAITING) && (
                            <button
                              type="button"
                              onClick={() => handleStatusChange(appt, AppointmentStatus.COMPLETED)}
                              className="px-2.5 py-1 text-xs font-medium border border-emerald-300 text-emerald-800 hover:bg-emerald-50 rounded-md transition-colors cursor-pointer"
                            >
                              Atendido
                            </button>
                          )}
                          {(!isTerminal || currentUser.role === StaffRole.ADMIN) &&
                            appt.status !== AppointmentStatus.CANCELLED && (
                              <button
                                type="button"
                                onClick={() => handleStatusChange(appt, AppointmentStatus.CANCELLED)}
                                className="px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-rose-700 rounded-md transition-colors cursor-pointer"
                              >
                                Cancelar
                              </button>
                            )}
                          <button
                            type="button"
                            onClick={() => onOpenPatientRx(appt.patientId)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#0F4C81] hover:bg-[#0F4C81]/10 rounded-md transition-colors cursor-pointer"
                          >
                            <FilePlus2 className="w-3.5 h-3.5" />
                            {canCreateRx ? 'Ficha / Receta' : 'Ver ficha'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteAppt(appt)}
                            aria-label="Eliminar turno"
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Eliminar
                          </button>
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

      {/* Modal Nuevo Turno */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Agendar turno en gabinete
              </h3>
              <button
                type="button"
                onClick={() => onSetModalOpen(false)}
                aria-label="Cerrar modal"
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Paciente
                </label>
                <select
                  required
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-[#0F4C81]"
                >
                  <option value="">Seleccionar paciente...</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} — DNI {p.dni}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Fecha y hora
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F4C81]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Profesional
                  </label>
                  <select
                    value={optometristName}
                    onChange={(e) => setOptometristName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-[#0F4C81]"
                  >
                    {optometrists.map((op) => (
                      <option key={op.uid} value={op.displayName}>
                        {op.displayName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Motivo de consulta
                </label>
                <input
                  type="text"
                  required
                  maxLength={160}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ej. Examen visual completo / Adaptación progresivos"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F4C81]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Notas previas
                </label>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observaciones de mostrador o cobertura..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F4C81]"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => onSetModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-[#0F4C81] hover:bg-[#0B3A63] disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
                >
                  {saving ? 'Guardando...' : 'Confirmar turno'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        open={Boolean(deleteAppt)}
        title="Eliminar turno"
        description={
          deleteAppt
            ? `Vas a eliminar el turno de "${deleteAppt.patientName}" del ${formatDateTimeString(deleteAppt.scheduledAt)}. Esta acción no se puede deshacer.`
            : ''
        }
        busy={deleting}
        onCancel={() => !deleting && setDeleteAppt(null)}
        onConfirm={handleDeleteAppointment}
      />
    </div>
  );
}
