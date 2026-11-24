import React, { useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { ShieldAlert, UserCheck } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { ROLE_LABELS } from '../lib/formatters';
import { useToast } from '../components/Toast';
import { StaffRole, type StaffUser } from '../types/optics';

interface TeamViewProps {
  currentUser: StaffUser;
  staffUsers: StaffUser[];
  loading: boolean;
}

export function TeamView({ currentUser, staffUsers, loading }: TeamViewProps) {
  const { notifySuccess, notifyError } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleUpdateMember = async (
    member: StaffUser,
    nextRole: StaffRole,
    nextActive: boolean
  ) => {
    if (member.uid === currentUser.uid && (!nextActive || nextRole !== StaffRole.ADMIN)) {
      notifyError('No podés quitarte tu propio rol de Administrador activo.');
      return;
    }

    setBusyId(member.id);
    try {
      await updateDoc(doc(db, 'staffUsers', member.id), {
        displayName: member.displayName,
        role: nextRole,
        active: nextActive,
        updatedAt: serverTimestamp(),
      });
      notifySuccess(`Permisos actualizados para ${member.displayName}.`);
    } catch (error) {
      notifyError('No se pudo actualizar el permiso del usuario.');
      handleFirestoreError(error, OperationType.UPDATE, `staffUsers/${member.id}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <UserCheck className="w-5 h-5 text-[#0F4C81] shrink-0 mt-0.5" />
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Cómo sumar vendedores u optómetras
            </h2>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Compartí el enlace del sistema con tu equipo. Al iniciar sesión con Google por primera
              vez, su cuenta aparecerá aquí como <strong>Pendiente</strong> para que le asignes el
              rol de <strong>Vendedor</strong>, <strong>Optómetra</strong> o <strong>Administrador</strong>.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            <div className="h-10 bg-slate-100 rounded animate-pulse" />
            <div className="h-10 bg-slate-100 rounded animate-pulse" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-3 px-4">Integrante</th>
                  <th className="py-3 px-4">Correo Google</th>
                  <th className="py-3 px-4">Rol asignado</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-right">Habilitación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {staffUsers.map((member) => {
                  const isSelf = member.uid === currentUser.uid;
                  const isBusy = busyId === member.id;
                  return (
                    <tr key={member.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900">
                          {member.displayName}
                          {isSelf ? ' (Tu cuenta)' : ''}
                        </p>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600">
                        {member.email}
                      </td>
                      <td className="py-3 px-4">
                        <select
                          disabled={isSelf || isBusy}
                          value={member.role}
                          onChange={(e) => {
                            const nextRole = e.target.value as StaffRole;
                            const nextActive =
                              nextRole === StaffRole.PENDING ? false : true;
                            void handleUpdateMember(member, nextRole, nextActive);
                          }}
                          className="px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-white disabled:bg-slate-50 disabled:text-slate-500"
                        >
                          <option value={StaffRole.PENDING}>Pendiente</option>
                          <option value={StaffRole.VENDEDOR}>Vendedor</option>
                          <option value={StaffRole.OPTOMETRA}>Optómetra</option>
                          <option value={StaffRole.ADMIN}>Administrador</option>
                        </select>
                      </td>
                      <td className="py-3 px-4 text-xs whitespace-nowrap">
                        {member.active && member.role !== StaffRole.PENDING ? (
                          <span className="font-semibold text-emerald-700">
                            Activo · {ROLE_LABELS[member.role]}
                          </span>
                        ) : (
                          <span className="font-semibold text-amber-700">
                            {member.role === StaffRole.PENDING ? 'Esperando aprobación' : 'Desactivado'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {!isSelf && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => {
                              const targetRole =
                                member.role === StaffRole.PENDING
                                  ? StaffRole.VENDEDOR
                                  : member.role;
                              void handleUpdateMember(member, targetRole, !member.active);
                            }}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                              member.active
                                ? 'border-rose-200 text-rose-700 hover:bg-rose-50'
                                : 'border-emerald-300 bg-emerald-600 text-white hover:bg-emerald-700'
                            }`}
                          >
                            {member.active ? 'Desactivar' : 'Aprobar acceso'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-start gap-2.5 text-xs text-slate-500 px-1">
        <ShieldAlert className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        <p>
          Resumen de permisos: <strong>Optómetra</strong> accede a Agenda, Pacientes y emite Recetas;{' '}
          <strong>Vendedor</strong> gestiona Presupuestos, Órdenes de Taller y Caja diaria;{' '}
          <strong>Administrador</strong> controla costos de inventario, cierres y roles del equipo.
        </p>
      </div>
    </div>
  );
}
