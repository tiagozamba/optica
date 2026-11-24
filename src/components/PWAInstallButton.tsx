import React, { useState } from 'react';
import { Download, Monitor, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'sidebar' | 'inline';
}

export function PWAInstallButton({ variant = 'sidebar' }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [guideOpen, setGuideOpen] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    setGuideOpen(true);
  };

  const buttonClass =
    variant === 'sidebar'
      ? 'w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-[#0F4C81] bg-[#0F4C81]/8 hover:bg-[#0F4C81]/15 border border-[#0F4C81]/20 rounded-lg transition-colors whitespace-nowrap cursor-pointer'
      : 'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[#0F4C81] bg-white hover:bg-slate-50 border border-[#0F4C81]/30 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer';

  return (
    <>
      <button type="button" onClick={handleClick} className={buttonClass}>
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>
          {isInstallable
            ? 'Instalar app'
            : isIOS
            ? 'Instalar en iPhone'
            : 'Instalar en Windows'}
        </span>
      </button>

      {guideOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {isIOS ? (
                  <Smartphone className="w-4 h-4 text-[#0F4C81]" />
                ) : (
                  <Monitor className="w-4 h-4 text-[#0F4C81]" />
                )}
                <h3 className="font-display text-base font-semibold text-slate-900">
                  {isIOS ? 'Instalar ÓpticaStudio en iPhone' : 'Instalar ÓpticaStudio en Windows'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                aria-label="Cerrar"
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm text-slate-600 leading-relaxed">
              {isIOS ? (
                <ol className="space-y-2 list-decimal list-inside">
                  <li>
                    Abrí la aplicación directamente en <strong>Safari</strong>.
                  </li>
                  <li>
                    Tocá el botón <strong>Compartir</strong> en la barra inferior.
                  </li>
                  <li>
                    Elegí <strong>Agregar a inicio</strong> y confirmá tocando{' '}
                    <strong>Agregar</strong>.
                  </li>
                </ol>
              ) : (
                <>
                  <div>
                    <p className="font-semibold text-slate-900 mb-1.5">
                      Instalación directa como aplicación de escritorio
                    </p>
                    <ol className="space-y-1.5 list-decimal list-inside text-xs text-slate-600">
                      <li>
                        Abrí la app en una pestaña independiente de <strong>Microsoft Edge</strong>{' '}
                        o <strong>Google Chrome</strong> (si la estás viendo embebida, usá el enlace
                        compartido).
                      </li>
                      <li>
                        Hacé clic en el ícono de <strong>Instalar ÓpticaStudio</strong> en la barra
                        de direcciones (o en Menú → Aplicaciones → Instalar este sitio como
                        aplicación).
                      </li>
                      <li>
                        Se creará un acceso directo en el Menú Inicio y Escritorio con su propia
                        ventana independiente.
                      </li>
                    </ol>
                  </div>

                  <div className="pt-3 border-t border-slate-200">
                    <p className="font-semibold text-slate-900 mb-1 text-xs">
                      Instalador nativo .exe (Electron sin navegador externo)
                    </p>
                    <p className="text-xs text-slate-600">
                      El proyecto incluye la configuración de escritorio en la carpeta{' '}
                      <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">electron/</code>{' '}
                      para compilar un instalador{' '}
                      <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">.exe</code>{' '}
                      autónomo en Windows cuando exportes el código fuente.
                    </p>
                  </div>
                </>
              )}

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setGuideOpen(false)}
                  className="px-4 py-2 bg-[#0F4C81] hover:bg-[#0B3A63] text-white text-xs font-medium rounded-lg cursor-pointer"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="no-print fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-medium text-white shadow-sm">
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>Sin conexión · Esperando red para sincronizar con la nube</span>
    </div>
  );
}
