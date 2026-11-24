import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { Clock3, Eye, LogOut, ShieldCheck } from 'lucide-react';
import {
  auth,
  BOOTSTRAP_ADMIN_EMAIL,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import { StaffRole, type StaffUser } from '../types/optics';
import { ROLE_LABELS } from '../lib/formatters';
import { PWAInstallButton } from './PWAInstallButton';

interface AuthGateProps {
  children: (staffUser: StaffUser) => React.ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [staffProfile, setStaffProfile] = useState<StaffUser | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [signInBusy, setSignInBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (!user) {
        setStaffProfile(null);
        setProfileLoading(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authReady || !firebaseUser) return;

    setProfileLoading(true);
    const staffPath = `staffUsers/${firebaseUser.uid}`;
    const staffRef = doc(db, 'staffUsers', firebaseUser.uid);

    const unsub = onSnapshot(
      staffRef,
      async (snapshot) => {
        if (!snapshot.exists()) {
          const isBootstrap =
            firebaseUser.emailVerified && firebaseUser.email === BOOTSTRAP_ADMIN_EMAIL;
          const fallbackName =
            firebaseUser.displayName?.trim() ||
            firebaseUser.email?.split('@')[0] ||
            'Usuario Óptica';
          try {
            await setDoc(staffRef, {
              uid: firebaseUser.uid,
              email: firebaseUser.email ?? 'sin-correo@optica.local',
              displayName: fallbackName.slice(0, 120),
              role: isBootstrap ? StaffRole.ADMIN : StaffRole.PENDING,
              active: isBootstrap,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } catch (err) {
            handleFirestoreError(err, OperationType.CREATE, staffPath);
          }
          return;
        }

        const data = snapshot.data();
        setStaffProfile({
          id: snapshot.id,
          uid: String(data.uid ?? snapshot.id),
          email: String(data.email ?? ''),
          displayName: String(data.displayName ?? ''),
          role: (data.role as StaffRole) ?? StaffRole.PENDING,
          active: Boolean(data.active),
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        });
        setProfileLoading(false);
      },
      (error) => {
        setProfileLoading(false);
        handleFirestoreError(error, OperationType.GET, staffPath);
      }
    );

    return () => unsub();
  }, [authReady, firebaseUser]);

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setSignInBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'No se pudo iniciar sesión.';
      if (msg.includes('popup-closed-by-user')) {
        setAuthError('Cerraste la ventana de Google antes de completar el ingreso.');
      } else if (msg.includes('popup-blocked')) {
        setAuthError('El navegador bloqueó la ventana emergente. Habilitá las ventanas emergentes para continuar.');
      } else {
        setAuthError('No pudimos validar tu cuenta con Google. Intentá nuevamente.');
      }
    } finally {
      setSignInBusy(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  if (!authReady || (firebaseUser && profileLoading)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl px-8 py-7 max-w-sm w-full text-center">
          <div className="w-9 h-9 rounded-lg bg-[#0F4C81]/10 text-[#0F4C81] flex items-center justify-center mx-auto mb-4">
            <Eye className="w-5 h-5" />
          </div>
          <p className="text-sm font-medium text-slate-900">Verificando sesión en ÓpticaStudio</p>
          <p className="text-xs text-slate-500 mt-1">Sincronizando permisos del equipo...</p>
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <div className="min-h-screen bg-slate-50 grid lg:grid-cols-2 items-stretch">
        <div className="flex flex-col justify-between p-8 sm:p-12 lg:p-16 bg-white border-b lg:border-b-0 lg:border-r border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0F4C81] text-white flex items-center justify-center shrink-0">
              <Eye className="w-4 h-4" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
              ÓpticaStudio
            </span>
          </div>

          <div className="max-w-md my-12">
            <p className="text-xs font-medium text-[#0F4C81] tracking-wide mb-3">
              Gestión clínica y comercial para ópticas
            </p>
            <h1 className="font-display text-3xl sm:text-4xl font-semibold text-slate-900 leading-tight mb-4">
              Gabinete, mostrador y laboratorio en un solo sistema.
            </h1>
            <p className="text-base text-slate-600 leading-relaxed mb-8">
              Administrá turnos optométricos, recetas con graduación OD/OI, inventario de armazones y cristales, órdenes de taller y arqueo de caja con acceso por roles.
            </p>

            {authError && (
              <div className="mb-5 p-3.5 rounded-lg border border-rose-200 bg-rose-50 text-sm text-rose-800">
                {authError}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={signInBusy}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-6 py-3 bg-[#0F4C81] hover:bg-[#0B3A63] disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 shrink-0" />
                {signInBusy ? 'Conectando con Google...' : 'Ingresar con cuenta Google'}
              </button>
              <PWAInstallButton variant="inline" />
            </div>

            <div className="mt-8 pt-6 border-t border-slate-200 grid grid-cols-3 gap-4 text-xs text-slate-600">
              <div>
                <p className="font-medium text-slate-900">Administrador</p>
                <p className="mt-0.5 text-slate-500">Caja, costos y roles</p>
              </div>
              <div>
                <p className="font-medium text-slate-900">Vendedor</p>
                <p className="mt-0.5 text-slate-500">Presupuestos y taller</p>
              </div>
              <div>
                <p className="font-medium text-slate-900">Optómetra</p>
                <p className="mt-0.5 text-slate-500">Agenda y recetas</p>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            ÓpticaStudio · Respaldo sincronizado en la nube
          </p>
        </div>

        <div className="relative hidden lg:block bg-slate-100 overflow-hidden">
          {!imgError ? (
            <img
              src="/src/assets/images/hero_optical_studio_1794865517923.jpg"
              alt="Interior luminoso de estudio óptico con exhibición de armazones"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-12">
              <div className="text-center max-w-sm">
                <Eye className="w-10 h-10 text-[#0F4C81] mx-auto mb-3" />
                <p className="font-display text-lg font-semibold text-slate-900">
                  Estudio Óptico Clínico
                </p>
              </div>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/20 to-transparent flex items-end p-12">
            <div className="max-w-md text-white">
              <p className="text-xs text-slate-200 mb-2">
                Trazabilidad completa · Mostrador y Gabinete
              </p>
              <p className="font-display text-xl font-semibold leading-snug">
                Cada receta emitida se vincula directamente con el presupuesto, el inventario y la orden de laboratorio.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!staffProfile || !staffProfile.active || staffProfile.role === StaffRole.PENDING) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-8">
          <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mb-5">
            <Clock3 className="w-5 h-5" />
          </div>
          <h1 className="font-display text-xl font-semibold text-slate-900 mb-2">
            {staffProfile?.role === StaffRole.PENDING
              ? 'Acceso pendiente de habilitación'
              : 'Cuenta desactivada'}
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed mb-5">
            {staffProfile?.role === StaffRole.PENDING
              ? 'Tu solicitud de ingreso fue registrada. Pedile al Administrador de la óptica que habilite tu cuenta y te asigne el rol correspondiente (Vendedor, Optómetra o Administrador) desde el módulo Equipo y Roles.'
              : 'Tu usuario se encuentra momentáneamente inactivo. Comunicate con el Administrador de la óptica para restablecer el acceso.'}
          </p>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm space-y-1.5 mb-6">
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Usuario</span>
              <span className="font-medium text-slate-900 truncate">
                {staffProfile?.displayName || firebaseUser.displayName}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Correo</span>
              <span className="font-mono text-xs text-slate-700 truncate">
                {staffProfile?.email || firebaseUser.email}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Estado</span>
              <span className="font-medium text-amber-700">
                {staffProfile ? ROLE_LABELS[staffProfile.role] : 'Registrando...'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  return <>{children(staffProfile)}</>;
}
