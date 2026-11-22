import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuideModal(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        className={
          compact
            ? 'inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-sky-200 bg-sky-50/70 px-3.5 py-2 text-xs font-semibold text-[#0F4C81] hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F4C81] transition-colors whitespace-nowrap shrink-0'
            : 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#0F4C81] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0c3d68] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F4C81] transition-colors whitespace-nowrap shrink-0'
        }
      >
        <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{isAndroid ? 'Install on Android' : 'Install App'}</span>
      </button>

      {showGuideModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-guide-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <Smartphone className="h-5 w-5 text-[#0F4C81] shrink-0" aria-hidden="true" />
                <h3 id="pwa-guide-title" className="text-base font-bold text-slate-900">
                  Add MedAtlas Tutor to Home Screen
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                aria-label="Close installation guide"
                className="flex min-h-[44px] min-w-[44px] -mr-2 -mt-2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {isIOS ? (
              <ol className="mt-4 space-y-2.5 text-sm leading-relaxed text-slate-700 list-decimal list-inside">
                <li>
                  Tap the <strong>Share</strong> icon in your Safari toolbar.
                </li>
                <li>
                  Scroll down and tap <strong>Add to Home Screen</strong>.
                </li>
                <li>
                  Launch <strong>MedAtlas</strong> directly from your home screen for full-screen offline study.
                </li>
              </ol>
            ) : (
              <ol className="mt-4 space-y-2.5 text-sm leading-relaxed text-slate-700 list-decimal list-inside">
                <li>
                  Open this page in <strong>Chrome on Android</strong> (or desktop Chrome/Edge).
                </li>
                <li>
                  Tap the three-dot browser menu in the top-right corner.
                </li>
                <li>
                  Select <strong>Install app</strong> or <strong>Add to Home screen</strong> for instant offline access without Play Store installation.
                </li>
              </ol>
            )}

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="mt-6 w-full min-h-[44px] rounded-lg bg-[#0F4C81] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0c3d68] transition-colors"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
};
