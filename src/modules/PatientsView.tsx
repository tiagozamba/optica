import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Copy, Eye, FileText, Info, Pencil, Plus, Printer, Search, Trash2, UserPlus, X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { formatDateString, sanitizeDni, todayIsoDate } from '../lib/formatters';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';
import { useToast } from '../components/Toast';
import {
  BLUEPRINT_LIMITS,
  LensType,
  StaffRole,
  type EyeRx,
  type Patient,
  type Prescription,
  type StaffUser,
} from '../types/optics';

interface PatientsViewProps {
  currentUser: StaffUser;
  patients: Patient[];
  prescriptions: Prescription[];
  loading: boolean;
  selectedPatientId: string | null;
  onSelectPatientId: (id: string | null) => void;
  patientModalOpen: boolean;
  onSetPatientModalOpen: (open: boolean) => void;
  onCreateSaleForPatient: (patientId: string, prescriptionId?: string) => void;
}

const EMPTY_EYE: EyeRx = {
  sphere: '0.00',
  cylinder: '0.00',
  axis: '0°',
  addition: '—',
  pd: '31.5',
  height: '18.0',
  prism: '—',
};

export function PatientsView({
  currentUser,
  patients,
  prescriptions,
  loading,
  selectedPatientId,
  onSelectPatientId,
  patientModalOpen,
  onSetPatientModalOpen,
  onCreateSaleForPatient,
}: PatientsViewProps) {
  const { notifySuccess, notifyError } = useToast();
  const [search, setSearch] = useState('');
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);

  // Patient form
  const [fullName, setFullName] = useState('');
  const [dni, setDni] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [insuranceName, setInsuranceName] = useState('');
  const [notes, setNotes] = useState('');
  const [savingPatient, setSavingPatient] = useState(false);

  // Prescription modal
  const [rxModalOpen, setRxModalOpen] = useState(false);
  const [examDate, setExamDate] = useState(todayIsoDate());
  const [lensType, setLensType] = useState<LensType>(LensType.MONOFOCAL);
  const [od, setOd] = useState<EyeRx>({ ...EMPTY_EYE });
  const [oi, setOi] = useState<EyeRx>({ ...EMPTY_EYE });
  const [rxNotes, setRxNotes] = useState('');
  const [savingRx, setSavingRx] = useState(false);

  // Printable Rx preview
  const [printRx, setPrintRx] = useState<Prescription | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<
    { kind: 'patient'; item: Patient } | { kind: 'rx'; item: Prescription } | null
  >(null);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = currentUser.role === StaffRole.ADMIN;
  const canIssueRx = isAdmin || currentUser.role === StaffRole.OPTOMETRA;
  const canSell = isAdmin || currentUser.role === StaffRole.VENDEDOR;
  const canDeleteRx = (rx: Prescription) =>
    isAdmin || (currentUser.role === StaffRole.OPTOMETRA && rx.optometristId === currentUser.uid);

  useEffect(() => {
    if (!selectedPatientId && patients.length > 0) {
      onSelectPatientId(patients[0].id);
    }
  }, [patients, selectedPatientId, onSelectPatientId]);

  const filteredPatients = useMemo(() => {
    const q = search.trim().toLowerCase();
    return patients
      .filter((p) => {
        if (!q) return true;
        return (
          p.fullName.toLowerCase().includes(q) ||
          p.dni.toLowerCase().includes(q) ||
          p.phone.toLowerCase().includes(q) ||
          p.insuranceName.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [patients, search]);

  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === selectedPatientId) ?? null,
    [patients, selectedPatientId]
  );

  const patientPrescriptions = useMemo(() => {
    if (!selectedPatient) return [];
    return prescriptions
      .filter((rx) => rx.patientId === selectedPatient.id)
      .sort((a, b) => b.examDate.localeCompare(a.examDate));
  }, [prescriptions, selectedPatient]);

  const openCreatePatient = () => {
    setEditingPatient(null);
    setFullName('');
    setDni('');
    setPhone('');
    setEmail('');
    setInsuranceName('Particular');
    setNotes('');
    onSetPatientModalOpen(true);
  };

  const openEditPatient = (p: Patient) => {
    setEditingPatient(p);
    setFullName(p.fullName);
    setDni(p.dni);
    setPhone(p.phone);
    setEmail(p.email);
    setInsuranceName(p.insuranceName);
    setNotes(p.notes);
    onSetPatientModalOpen(true);
  };

  const handleSavePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanDni = sanitizeDni(dni);
    if (fullName.trim().length < 2) {
      notifyError('Ingresá el nombre completo del paciente.');
      return;
    }
    if (cleanDni.length < 4 || !BLUEPRINT_LIMITS.DNI_PATTERN.test(cleanDni)) {
      notifyError('El DNI debe tener al menos 4 caracteres alfanuméricos sin espacios.');
      return;
    }
    if (phone.trim().length < 5) {
      notifyError('Ingresá un teléfono de contacto válido.');
      return;
    }

    setSavingPatient(true);
    try {
      if (editingPatient) {
        await updateDoc(doc(db, 'patients', editingPatient.id), {
          fullName: fullName.trim().slice(0, BLUEPRINT_LIMITS.MAX_NAME),
          dni: cleanDni.slice(0, 24),
          phone: phone.trim().slice(0, BLUEPRINT_LIMITS.MAX_PHONE),
          email: email.trim().slice(0, BLUEPRINT_LIMITS.MAX_EMAIL),
          insuranceName: insuranceName.trim().slice(0, 100),
          notes: notes.trim().slice(0, BLUEPRINT_LIMITS.MAX_NOTES_LONG),
          updatedAt: serverTimestamp(),
        });
        notifySuccess('Ficha de paciente actualizada.');
      } else {
        const ref = await addDoc(collection(db, 'patients'), {
          fullName: fullName.trim().slice(0, BLUEPRINT_LIMITS.MAX_NAME),
          dni: cleanDni.slice(0, 24),
          phone: phone.trim().slice(0, BLUEPRINT_LIMITS.MAX_PHONE),
          email: email.trim().slice(0, BLUEPRINT_LIMITS.MAX_EMAIL),
          insuranceName: (insuranceName.trim() || 'Particular').slice(0, 100),
          notes: notes.trim().slice(0, BLUEPRINT_LIMITS.MAX_NOTES_LONG),
          createdBy: currentUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        onSelectPatientId(ref.id);
        notifySuccess('Paciente registrado en el padrón.');
      }
      onSetPatientModalOpen(false);
    } catch (error) {
      notifyError('No se pudo guardar la ficha del paciente.');
      handleFirestoreError(error, OperationType.WRITE, 'patients');
    } finally {
      setSavingPatient(false);
    }
  };

  const handleSavePrescription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;

    setSavingRx(true);
    try {
      await addDoc(collection(db, 'prescriptions'), {
        patientId: selectedPatient.id,
        patientName: selectedPatient.fullName.slice(0, 120),
        optometristId: currentUser.uid,
        optometristName: currentUser.displayName.slice(0, 120),
        examDate: examDate.slice(0, 20),
        lensType,
        od: {
          sphere: od.sphere.trim().slice(0, 16) || '0.00',
          cylinder: od.cylinder.trim().slice(0, 16) || '0.00',
          axis: od.axis.trim().slice(0, 16) || '0°',
          addition: od.addition.trim().slice(0, 16) || '—',
          pd: od.pd.trim().slice(0, 16) || '—',
          height: (od.height ?? '').trim().slice(0, 16) || '—',
          prism: od.prism.trim().slice(0, 32) || '—',
        },
        oi: {
          sphere: oi.sphere.trim().slice(0, 16) || '0.00',
          cylinder: oi.cylinder.trim().slice(0, 16) || '0.00',
          axis: oi.axis.trim().slice(0, 16) || '0°',
          addition: oi.addition.trim().slice(0, 16) || '—',
          pd: oi.pd.trim().slice(0, 16) || '—',
          height: (oi.height ?? '').trim().slice(0, 16) || '—',
          prism: oi.prism.trim().slice(0, 32) || '—',
        },
        notes: rxNotes.trim().slice(0, BLUEPRINT_LIMITS.MAX_NOTES_LONG),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      notifySuccess(`Receta óptica registrada para ${selectedPatient.fullName}.`);
      setRxModalOpen(false);
      setRxNotes('');
    } catch (error) {
      notifyError('No se pudo emitir la receta óptica.');
      handleFirestoreError(error, OperationType.CREATE, 'prescriptions');
    } finally {
      setSavingRx(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.kind === 'patient') {
        const patient = deleteTarget.item;
        await deleteDoc(doc(db, 'patients', patient.id));
        if (selectedPatientId === patient.id) {
          onSelectPatientId(null);
        }
        notifySuccess(`Paciente "${patient.fullName}" eliminado del padrón.`);
      } else {
        const rx = deleteTarget.item;
        await deleteDoc(doc(db, 'prescriptions', rx.id));
        if (printRx?.id === rx.id) {
          setPrintRx(null);
        }
        notifySuccess('Receta óptica eliminada.');
      }
      setDeleteTarget(null);
    } catch (error) {
      const targetPath =
        deleteTarget.kind === 'patient'
          ? `patients/${deleteTarget.item.id}`
          : `prescriptions/${deleteTarget.item.id}`;
      notifyError(
        deleteTarget.kind === 'patient'
          ? 'No se pudo eliminar el paciente.'
          : 'No se pudo eliminar la receta.'
      );
      handleFirestoreError(error, OperationType.DELETE, targetPath);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Columna izquierda: Padrón de pacientes */}
      <div className="no-print lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nombre, DNI o teléfono..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F4C81]"
            />
          </div>
          <button
            type="button"
            onClick={openCreatePatient}
            aria-label="Nuevo paciente"
            className="p-2 bg-[#0F4C81] hover:bg-[#0B3A63] text-white rounded-lg transition-colors shrink-0 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="p-4 space-y-2">
            <div className="h-12 bg-slate-100 rounded animate-pulse" />
            <div className="h-12 bg-slate-100 rounded animate-pulse" />
            <div className="h-12 bg-slate-100 rounded animate-pulse" />
          </div>
        ) : filteredPatients.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-medium text-slate-800">Sin pacientes encontrados</p>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Creá la primera ficha clínica para asociar recetas y presupuestos.
            </p>
            <button
              type="button"
              onClick={openCreatePatient}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#0F4C81] text-white text-xs font-medium rounded-lg cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Registrar paciente
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 max-h-[680px] overflow-y-auto">
            {filteredPatients.map((patient) => {
              const active = patient.id === selectedPatient?.id;
              const rxCount = prescriptions.filter((r) => r.patientId === patient.id).length;
              return (
                <button
                  key={patient.id}
                  type="button"
                  onClick={() => onSelectPatientId(patient.id)}
                  className={`w-full text-left px-4 py-3.5 transition-colors flex items-center justify-between gap-3 cursor-pointer ${
                    active ? 'bg-[#0F4C81]/8' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0">
                    <p
                      className={`text-sm font-semibold truncate ${
                        active ? 'text-[#0F4C81]' : 'text-slate-900'
                      }`}
                    >
                      {patient.fullName}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      <span className="font-mono">DNI {patient.dni}</span>
                      {' · '}
                      {patient.insuranceName || 'Particular'}
                    </p>
                  </div>
                  <span className="font-mono tabular-nums text-xs text-slate-500 shrink-0">
                    {rxCount} {rxCount === 1 ? 'receta' : 'recetas'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Columna derecha: Ficha clínica + Historial de recetas */}
      <div className="no-print lg:col-span-7 space-y-6">
        {!selectedPatient ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
            <FileText className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-900">Seleccioná un paciente</p>
            <p className="text-xs text-slate-500 mt-1">
              Visualizá sus datos de contacto, cobertura y el historial de recetas ópticas.
            </p>
          </div>
        ) : (
          <>
            <section className="bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-slate-200">
                <div>
                  <h2 className="font-display text-xl font-semibold text-slate-900">
                    {selectedPatient.fullName}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    <span className="font-mono">DNI {selectedPatient.dni}</span>
                    {' · '}
                    <span>{selectedPatient.phone}</span>
                    {selectedPatient.email ? ` · ${selectedPatient.email}` : ''}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditPatient(selectedPatient)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Editar ficha
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget({ kind: 'patient', item: selectedPatient })}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-rose-200 hover:bg-rose-50 text-rose-700 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Eliminar
                    </button>
                  )}
                  {canIssueRx && (
                    <button
                      type="button"
                      onClick={() => {
                        setOd({ ...EMPTY_EYE });
                        setOi({ ...EMPTY_EYE });
                        setExamDate(todayIsoDate());
                        setLensType(LensType.MONOFOCAL);
                        setRxNotes('');
                        setRxModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#0F4C81] hover:bg-[#0B3A63] text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Nueva receta
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Cobertura / Obra Social</p>
                  <p className="font-medium text-slate-900 mt-0.5">
                    {selectedPatient.insuranceName || 'Particular'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Notas clínicas y preferencias</p>
                  <p className="text-slate-700 mt-0.5">
                    {selectedPatient.notes || 'Sin observaciones registradas.'}
                  </p>
                </div>
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Historial de recetas ópticas
                </h3>
                <span className="font-mono tabular-nums text-xs text-slate-500">
                  {patientPrescriptions.length} registros
                </span>
              </div>

              {patientPrescriptions.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm text-slate-700">Este paciente aún no tiene recetas cargadas</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {canIssueRx
                      ? 'Emití una receta desde el botón "Nueva receta" para registrar su graduación OD/OI.'
                      : 'Solo el Optómetra o Administrador pueden emitir recetas clínicas.'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {patientPrescriptions.map((rx) => (
                    <div key={rx.id} className="p-6 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{rx.lensType}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {formatDateString(rx.examDate)} · Dr/Opt. {rx.optometristName}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPrintRx(rx)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            Imprimir receta
                          </button>
                          {canSell && (
                            <button
                              type="button"
                              onClick={() => onCreateSaleForPatient(selectedPatient.id, rx.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
                            >
                              Cotizar / Ordenar
                            </button>
                          )}
                          {canDeleteRx(rx) && (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget({ kind: 'rx', item: rx })}
                              aria-label="Eliminar receta"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-rose-200 hover:bg-rose-50 text-rose-700 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Eliminar
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="overflow-x-auto border border-slate-200 rounded-lg">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                              <th className="py-2 px-3">Ojo</th>
                              <th className="py-2 px-3 text-right">Esfera</th>
                              <th className="py-2 px-3 text-right">Cilindro</th>
                              <th className="py-2 px-3 text-right">Eje</th>
                              <th className="py-2 px-3 text-right">Adición</th>
                              <th className="py-2 px-3 text-right">DNP (mm)</th>
                              <th className="py-2 px-3 text-right">Altura (mm)</th>
                              <th className="py-2 px-3 text-right">Prisma</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 font-mono tabular-nums text-xs text-slate-900">
                            <tr>
                              <td className="py-2.5 px-3 font-sans font-semibold text-slate-800">
                                OD (Derecho)
                              </td>
                              <td className="py-2.5 px-3 text-right">{rx.od.sphere}</td>
                              <td className="py-2.5 px-3 text-right">{rx.od.cylinder}</td>
                              <td className="py-2.5 px-3 text-right">{rx.od.axis}</td>
                              <td className="py-2.5 px-3 text-right">{rx.od.addition}</td>
                              <td className="py-2.5 px-3 text-right">{rx.od.pd}</td>
                              <td className="py-2.5 px-3 text-right">{rx.od.height || '—'}</td>
                              <td className="py-2.5 px-3 text-right">{rx.od.prism}</td>
                            </tr>
                            <tr>
                              <td className="py-2.5 px-3 font-sans font-semibold text-slate-800">
                                OI (Izquierdo)
                              </td>
                              <td className="py-2.5 px-3 text-right">{rx.oi.sphere}</td>
                              <td className="py-2.5 px-3 text-right">{rx.oi.cylinder}</td>
                              <td className="py-2.5 px-3 text-right">{rx.oi.axis}</td>
                              <td className="py-2.5 px-3 text-right">{rx.oi.addition}</td>
                              <td className="py-2.5 px-3 text-right">{rx.oi.pd}</td>
                              <td className="py-2.5 px-3 text-right">{rx.oi.height || '—'}</td>
                              <td className="py-2.5 px-3 text-right">{rx.oi.prism}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {rx.notes && (
                        <p className="text-xs text-slate-600 leading-relaxed">{rx.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* Modal Alta/Edición Paciente */}
      {patientModalOpen && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900">
                {editingPatient ? 'Editar paciente' : 'Nuevo paciente'}
              </h3>
              <button
                type="button"
                onClick={() => onSetPatientModalOpen(false)}
                aria-label="Cerrar"
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePatient} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Nombre y apellido
                </label>
                <input
                  type="text"
                  required
                  maxLength={BLUEPRINT_LIMITS.MAX_NAME}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F4C81]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    DNI / Documento
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={24}
                    value={dni}
                    onChange={(e) => setDni(e.target.value)}
                    placeholder="Ej. 34819204"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F4C81]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Teléfono / WhatsApp
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={BLUEPRINT_LIMITS.MAX_PHONE}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+54 11 ..."
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F4C81]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Correo electrónico
                  </label>
                  <input
                    type="email"
                    maxLength={BLUEPRINT_LIMITS.MAX_EMAIL}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F4C81]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Obra social / Prepaga
                  </label>
                  <input
                    type="text"
                    maxLength={100}
                    value={insuranceName}
                    onChange={(e) => setInsuranceName(e.target.value)}
                    placeholder="Particular / OSDE / Swiss Medical"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F4C81]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Notas clínicas o preferencias
                </label>
                <textarea
                  rows={2}
                  maxLength={BLUEPRINT_LIMITS.MAX_NOTES_LONG}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F4C81]"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => onSetPatientModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingPatient}
                  className="px-4 py-2 bg-[#0F4C81] hover:bg-[#0B3A63] disabled:opacity-60 text-white text-sm font-medium rounded-lg cursor-pointer"
                >
                  {savingPatient ? 'Guardando...' : 'Guardar ficha'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Emitir Receta Óptica */}
      {rxModalOpen && selectedPatient && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-3xl w-full overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Emitir receta óptica
                </h3>
                <p className="text-xs text-slate-500">
                  Paciente: {selectedPatient.fullName} · DNI {selectedPatient.dni}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRxModalOpen(false)}
                aria-label="Cerrar"
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePrescription} className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Fecha del examen
                  </label>
                  <input
                    type="date"
                    required
                    value={examDate}
                    onChange={(e) => setExamDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F4C81]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Tipo de corrección
                  </label>
                  <select
                    value={lensType}
                    onChange={(e) => setLensType(e.target.value as LensType)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-[#0F4C81]"
                  >
                    {Object.values(LensType).map((lt) => (
                      <option key={lt} value={lt}>
                        {lt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0F4C81]">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  <span>Guía rápida de carga (valores por ojo)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1 text-[11px] text-slate-600 leading-relaxed">
                  <p>
                    <strong className="text-slate-800">Esfera (D):</strong> Miopía (-) o hipermetropía (+)
                  </p>
                  <p>
                    <strong className="text-slate-800">Cilindro y Eje (°):</strong> Astigmatismo (0°–180°)
                  </p>
                  <p>
                    <strong className="text-slate-800">Adición:</strong> Suma para cerca o progresivo
                  </p>
                  <p>
                    <strong className="text-slate-800">DNP (mm):</strong> Distancia del centro nasal a pupila
                  </p>
                  <p>
                    <strong className="text-slate-800">Altura (mm):</strong> Pupila al borde inferior del aro
                  </p>
                  <p>
                    <strong className="text-slate-800">Prisma:</strong> Desviación prismática (si aplica)
                  </p>
                </div>
              </div>

              {(
                [
                  { id: 'od', label: 'Ojo Derecho (OD)', state: od, setter: setOd },
                  { id: 'oi', label: 'Ojo Izquierdo (OI)', state: oi, setter: setOi },
                ] as const
              ).map(({ id, label, state, setter }) => (
                <div key={id} className="border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-900">{label}</p>
                    {id === 'oi' && (
                      <button
                        type="button"
                        onClick={() =>
                          setOi((prev) => ({
                            ...prev,
                            pd: od.pd,
                            height: od.height ?? '18.0',
                          }))
                        }
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-[#0F4C81] hover:bg-[#0F4C81]/10 border border-[#0F4C81]/20 rounded-md transition-colors cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        Copiar DNP y Altura desde OD
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
                    {(
                      [
                        { key: 'sphere', title: 'Esfera (D)', hint: 'Miopía / Hiperm.', placeholder: '-1.50' },
                        { key: 'cylinder', title: 'Cilindro (D)', hint: 'Astigmatismo', placeholder: '-0.75' },
                        { key: 'axis', title: 'Eje (°)', hint: '0° a 180°', placeholder: '180°' },
                        { key: 'addition', title: 'Adición', hint: 'Cerca / Progr.', placeholder: '+2.00' },
                        { key: 'pd', title: 'DNP (mm)', hint: 'Centro pupilar', placeholder: '31.5' },
                        { key: 'height', title: 'Altura (mm)', hint: 'Base del aro', placeholder: '18.5' },
                        { key: 'prism', title: 'Prisma', hint: 'Opcional', placeholder: '—' },
                      ] as const
                    ).map((field) => (
                      <div key={field.key}>
                        <label className="block text-[11px] font-semibold text-slate-700">
                          {field.title}
                        </label>
                        <p className="text-[10px] text-slate-400 mb-1 truncate">{field.hint}</p>
                        <input
                          type="text"
                          maxLength={field.key === 'prism' ? 32 : 16}
                          value={state[field.key] ?? ''}
                          onChange={(e) =>
                            setter((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                          placeholder={field.placeholder}
                          className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-md focus:outline-none focus:border-[#0F4C81]"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Indicaciones de gabinete y cristales sugeridos
                </label>
                <textarea
                  rows={2}
                  maxLength={BLUEPRINT_LIMITS.MAX_NOTES_LONG}
                  value={rxNotes}
                  onChange={(e) => setRxNotes(e.target.value)}
                  placeholder="Tratamientos recomendados (antirreflejo, filtro azul, fotocromático) u observaciones..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F4C81]"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setRxModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingRx}
                  className="px-4 py-2 bg-[#0F4C81] hover:bg-[#0B3A63] disabled:opacity-60 text-white text-sm font-medium rounded-lg cursor-pointer"
                >
                  {savingRx ? 'Guardando...' : 'Guardar receta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Vista Imprimible de Receta */}
      {printRx && selectedPatient && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="print-only-container bg-white border border-slate-200 rounded-xl max-w-2xl w-full p-8 space-y-6">
            <div className="flex items-start justify-between border-b border-slate-200 pb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#0F4C81] text-white flex items-center justify-center">
                  <Eye className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-display text-lg font-bold text-slate-900">ÓpticaStudio</p>
                  <p className="text-xs text-slate-500">Prescripción Óptica de Gabinete</p>
                </div>
              </div>
              <div className="text-right text-xs text-slate-600">
                <p>Fecha: {formatDateString(printRx.examDate)}</p>
                <p>Profesional: {printRx.optometristName}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-slate-500">Paciente</p>
                <p className="font-semibold text-slate-900">{selectedPatient.fullName}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">DNI / Cobertura</p>
                <p className="font-mono text-slate-900">
                  {selectedPatient.dni} · {selectedPatient.insuranceName}
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-500 mb-2">
                Corrección indicada: {printRx.lensType}
              </p>
              <table className="w-full text-left border border-slate-300 border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-300 text-xs font-medium text-slate-600">
                    <th className="py-2.5 px-3">Ojo</th>
                    <th className="py-2.5 px-3 text-right">Esfera</th>
                    <th className="py-2.5 px-3 text-right">Cilindro</th>
                    <th className="py-2.5 px-3 text-right">Eje</th>
                    <th className="py-2.5 px-3 text-right">Adición</th>
                    <th className="py-2.5 px-3 text-right">DNP (mm)</th>
                    <th className="py-2.5 px-3 text-right">Altura (mm)</th>
                    <th className="py-2.5 px-3 text-right">Prisma</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono tabular-nums text-sm">
                  <tr>
                    <td className="py-3 px-3 font-sans font-semibold">OD</td>
                    <td className="py-3 px-3 text-right">{printRx.od.sphere}</td>
                    <td className="py-3 px-3 text-right">{printRx.od.cylinder}</td>
                    <td className="py-3 px-3 text-right">{printRx.od.axis}</td>
                    <td className="py-3 px-3 text-right">{printRx.od.addition}</td>
                    <td className="py-3 px-3 text-right">{printRx.od.pd}</td>
                    <td className="py-3 px-3 text-right">{printRx.od.height || '—'}</td>
                    <td className="py-3 px-3 text-right">{printRx.od.prism}</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-3 font-sans font-semibold">OI</td>
                    <td className="py-3 px-3 text-right">{printRx.oi.sphere}</td>
                    <td className="py-3 px-3 text-right">{printRx.oi.cylinder}</td>
                    <td className="py-3 px-3 text-right">{printRx.oi.axis}</td>
                    <td className="py-3 px-3 text-right">{printRx.oi.addition}</td>
                    <td className="py-3 px-3 text-right">{printRx.oi.pd}</td>
                    <td className="py-3 px-3 text-right">{printRx.oi.height || '—'}</td>
                    <td className="py-3 px-3 text-right">{printRx.oi.prism}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {printRx.notes && (
              <div className="text-xs text-slate-700 border-t border-slate-200 pt-4">
                <p className="font-semibold text-slate-900 mb-1">Observaciones</p>
                <p>{printRx.notes}</p>
              </div>
            )}

            <div className="no-print pt-4 border-t border-slate-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPrintRx(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F4C81] hover:bg-[#0B3A63] text-white text-sm font-medium rounded-lg cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Imprimir / Guardar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        title={
          deleteTarget?.kind === 'patient' ? 'Eliminar paciente' : 'Eliminar receta óptica'
        }
        description={
          deleteTarget?.kind === 'patient'
            ? `Vas a eliminar la ficha de "${deleteTarget.item.fullName}" (DNI ${deleteTarget.item.dni}). Esta acción no se puede deshacer.`
            : deleteTarget?.kind === 'rx'
            ? `Vas a eliminar la receta del ${formatDateString(deleteTarget.item.examDate)} (${deleteTarget.item.lensType}). Esta acción no se puede deshacer.`
            : ''
        }
        busy={deleting}
        onCancel={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
