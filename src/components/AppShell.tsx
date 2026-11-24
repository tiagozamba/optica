import React, { useState } from 'react';
import { signOut } from 'firebase/auth';
import {
  CalendarClock,
  ClipboardList,
  CreditCard,
  Eye,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Users,
  UserCog,
  X,
} from 'lucide-react';
import { auth } from '../lib/firebase';
import { ROLE_LABELS } from '../lib/formatters';
import { AppModule, StaffRole, type StaffUser } from '../types/optics';
import { PWAInstallButton } from './PWAInstallButton';

interface NavItem {
  id: AppModule;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: StaffRole[];
}

const NAV_ITEMS: NavItem[] = [
  {
    id: AppModule.DASHBOARD,
    label: 'Resumen del día',
    icon: LayoutDashboard,
    roles: [StaffRole.ADMIN, StaffRole.VENDEDOR, StaffRole.OPTOMETRA],
  },
  {
    id: AppModule.APPOINTMENTS,
    label: 'Agenda y Gabinete',
    icon: CalendarClock,
    roles: [StaffRole.ADMIN, StaffRole.VENDEDOR, StaffRole.OPTOMETRA],
  },
  {
    id: AppModule.PATIENTS,
    label: 'Pacientes y Recetas',
    icon: Users,
    roles: [StaffRole.ADMIN, StaffRole.VENDEDOR, StaffRole.OPTOMETRA],
  },
  {
    id: AppModule.WORK_ORDERS,
    label: 'Órdenes de Taller',
    icon: ClipboardList,
    roles: [StaffRole.ADMIN, StaffRole.VENDEDOR, StaffRole.OPTOMETRA],
  },
  {
    id: AppModule.INVENTORY,
    label: 'Inventario',
    icon: Package,
    roles: [StaffRole.ADMIN, StaffRole.VENDEDOR, StaffRole.OPTOMETRA],
  },
  {
    id: AppModule.POS_CASH,
    label: 'Mostrador y Caja',
    icon: CreditCard,
    roles: [StaffRole.ADMIN, StaffRole.VENDEDOR],
  },
  {
    id: AppModule.TEAM,
    label: 'Equipo y Roles',
    icon: UserCog,
    roles: [StaffRole.ADMIN],
  },
];

interface AppShellProps {
  currentUser: StaffUser;
  activeModule: AppModule;
  onSelectModule: (mod: AppModule) => void;
  primaryAction?: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({
  currentUser,
  activeModule,
  onSelectModule,
  primaryAction,
  children,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(currentUser.role));
  const currentNav = visibleItems.find((item) => item.id === activeModule) ?? visibleItems[0];

  const handleSelect = (mod: AppModule) => {
    onSelectModule(mod);
    setMobileOpen(false);
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[#0F4C81] text-white flex items-center justify-center shrink-0">
            <Eye className="w-4 h-4" />
          </div>
          <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            ÓpticaStudio
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Cerrar menú"
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 rounded-md"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Navegación principal">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === activeModule;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-[#0F4C81] text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-200 shrink-0 space-y-2.5">
        <div className="mb-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">{currentUser.displayName}</p>
          <p className="text-xs text-slate-500 truncate">
            {ROLE_LABELS[currentUser.role]} · {currentUser.email}
          </p>
        </div>
        <PWAInstallButton variant="sidebar" />
        <button
          type="button"
          onClick={handleLogout}
          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          Cerrar sesión
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop sidebar */}
      <aside className="no-print hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-64 max-w-[80vw] h-full z-10">{sidebarContent}</div>
        </div>
      )}

      {/* Main workspace */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="no-print h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 sm:gap-8 sticky top-0 z-20 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menú"
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 hidden sm:inline whitespace-nowrap">ÓpticaStudio</span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <h1 className="font-display font-semibold text-slate-900 truncate">
                {currentNav?.label ?? 'Inicio'}
              </h1>
            </div>
          </div>

          {primaryAction && <div className="shrink-0">{primaryAction}</div>}
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
