import React, { useState } from 'react';
import {
  BookOpen,
  ClipboardCheck,
  Cloud,
  FileDown,
  Film,
  FlaskConical,
  GraduationCap,
  Home,
  LayoutGrid,
  MessageSquareText,
  Scale,
  X,
} from 'lucide-react';
import type { ActiveTab } from './Header';

interface MobileBottomNavProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
}

const ALL_MODULES: Array<{
  id: ActiveTab;
  label: string;
  subtitle: string;
  Icon: React.FC<{ className?: string }>;
}> = [
  {
    id: 'home',
    label: 'Home',
    subtitle: 'Search any medical topic & open Blueprint',
    Icon: Home,
  },
  {
    id: 'tutor',
    label: 'Tutor',
    subtitle: 'Step-by-step explanations & SVG diagrams',
    Icon: GraduationCap,
  },
  {
    id: 'library',
    label: 'Textbooks',
    subtitle: 'Upload & read indexed medical PDFs',
    Icon: BookOpen,
  },
  {
    id: 'lecture',
    label: '3D Lectures',
    subtitle: 'Continuous 3D doctor lectures & MP4 export',
    Icon: Film,
  },
  {
    id: 'pdfs',
    label: 'Study PDFs',
    subtitle: 'Colorful A4 textbook study guides',
    Icon: FileDown,
  },
  {
    id: 'exams',
    label: 'Exams',
    subtitle: 'Timed countdown exams & practice mode',
    Icon: ClipboardCheck,
  },
  {
    id: 'research',
    label: 'Research',
    subtitle: 'PubMed articles & ClinicalTrials.gov',
    Icon: FlaskConical,
  },
  {
    id: 'guidelines',
    label: 'Guidelines',
    subtitle: 'NICE, WHO, PubMed & UpToDate portals',
    Icon: Scale,
  },
  {
    id: 'assistant',
    label: 'AI Assistant',
    subtitle: 'Bilingual medical Q&A (EN & Egyptian AR)',
    Icon: MessageSquareText,
  },
  {
    id: 'sync',
    label: 'Cloud Sync & Offline',
    subtitle: 'Encrypted vault & Android install',
    Icon: Cloud,
  },
];

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onSelectTab,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const normalizedTab: ActiveTab = activeTab === 'qbank' ? 'exams' : activeTab;

  const primaryTabs: Array<{
    id: ActiveTab;
    label: string;
    Icon: React.FC<{ className?: string }>;
  }> = [
    { id: 'home', label: 'Home', Icon: Home },
    { id: 'tutor', label: 'Tutor', Icon: GraduationCap },
    { id: 'lecture', label: '3D Lectures', Icon: Film },
    { id: 'exams', label: 'Exams', Icon: ClipboardCheck },
  ];

  const isSecondaryActive =
    normalizedTab === 'library' ||
    normalizedTab === 'pdfs' ||
    normalizedTab === 'research' ||
    normalizedTab === 'guidelines' ||
    normalizedTab === 'assistant' ||
    normalizedTab === 'sync';

  return (
    <>
      <nav
        aria-label="Mobile bottom navigation"
        className="no-print md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-md"
      >
        <div className="grid h-14 grid-cols-5 items-center">
          {primaryTabs.map(({ id, label, Icon }) => {
            const isActive = normalizedTab === id && !drawerOpen;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  onSelectTab(id);
                }}
                aria-current={isActive ? 'page' : undefined}
                className={`flex min-h-[48px] flex-col items-center justify-center px-1 transition-colors cursor-pointer ${
                  isActive
                    ? 'text-[#0F4C81] font-semibold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="mt-0.5 text-[11px] leading-tight whitespace-nowrap truncate max-w-full">
                  {label}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            aria-expanded={drawerOpen}
            aria-controls="mobile-all-modules-sheet"
            onClick={() => setDrawerOpen((prev) => !prev)}
            className={`flex min-h-[48px] flex-col items-center justify-center px-1 transition-colors cursor-pointer ${
              drawerOpen || isSecondaryActive
                ? 'text-[#0F4C81] font-semibold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <LayoutGrid className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="mt-0.5 text-[11px] leading-tight whitespace-nowrap truncate max-w-full">
              Modules
            </span>
          </button>
        </div>
      </nav>

      {drawerOpen && (
        <div
          id="mobile-all-modules-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="All medical learning modules"
          className="no-print md:hidden fixed inset-0 z-40 flex flex-col justify-end bg-slate-900/50 backdrop-blur-xs"
        >
          <div className="max-h-[82vh] w-full overflow-y-auto rounded-t-2xl border-t border-slate-200 bg-white px-4 pt-4 pb-20 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-[#0F4C81]">
                  Medical Learning Modules
                </h2>
                <p className="text-xs text-slate-500">
                  Switch between Tutor, 3D Lectures, Study PDFs, Timed Exams &amp; Evidence
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close modules menu"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ALL_MODULES.map(({ id, label, subtitle, Icon }) => {
                const active = normalizedTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setDrawerOpen(false);
                      onSelectTab(id);
                    }}
                    className={`flex min-h-[54px] w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                      active
                        ? 'border-[#0F4C81] bg-sky-50/70'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${
                        active
                          ? 'bg-[#0F4C81] text-white'
                          : 'bg-sky-50 text-[#0F4C81]'
                      }`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-[#0F4C81] truncate">
                        {label}
                      </span>
                      <span className="block text-xs text-slate-500 truncate">
                        {subtitle}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
