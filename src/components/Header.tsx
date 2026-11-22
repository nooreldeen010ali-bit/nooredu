import React from 'react';
import {
  BookOpen,
  ClipboardCheck,
  Cloud,
  FileDown,
  Film,
  FlaskConical,
  GraduationCap,
  Home,
  Scale,
  Stethoscope,
  Upload,
} from 'lucide-react';

export type ActiveTab =
  | 'home'
  | 'tutor'
  | 'library'
  | 'lecture'
  | 'pdfs'
  | 'exams'
  | 'qbank'
  | 'research'
  | 'guidelines'
  | 'assistant'
  | 'sync';

interface HeaderProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onTriggerUpload: () => void;
  savedCount: number;
  textbookCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  onTriggerUpload,
  savedCount,
  textbookCount,
}) => {
  const navItems: Array<{
    id: ActiveTab;
    label: string;
    badge?: number;
    Icon: React.FC<{ className?: string }>;
  }> = [
    { id: 'home', label: 'Home', Icon: Home },
    { id: 'tutor', label: 'Tutor', Icon: GraduationCap },
    { id: 'library', label: 'Textbooks', badge: textbookCount, Icon: BookOpen },
    { id: 'lecture', label: '3D Lectures', Icon: Film },
    { id: 'pdfs', label: 'Study PDFs', badge: savedCount, Icon: FileDown },
    { id: 'exams', label: 'Exams', Icon: ClipboardCheck },
    { id: 'research', label: 'Research', Icon: FlaskConical },
    { id: 'guidelines', label: 'Guidelines', Icon: Scale },
  ];

  const normalizedActiveTab: ActiveTab =
    activeTab === 'qbank' ? 'exams' : activeTab;

  return (
    <header className="no-print border-b border-slate-200 bg-white w-full max-w-full">
      {/* Row 1: Compact Brand Identity & Essential Actions */}
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2.5 px-3.5 py-2.5 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => onSelectTab('home')}
          className="inline-flex min-h-[44px] items-center gap-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F4C81] min-w-0 cursor-pointer"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0F4C81] text-white shrink-0">
            <Stethoscope className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm sm:text-base font-bold tracking-tight text-[#0F4C81]">
              MedAtlas Tutor
            </span>
            <span className="hidden sm:block truncate text-[11px] font-medium text-slate-500">
              Unified Medical Topic Blueprint Platform
            </span>
          </span>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onSelectTab('sync')}
            aria-current={normalizedActiveTab === 'sync' ? 'page' : undefined}
            className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-2.5 sm:px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              normalizedActiveTab === 'sync'
                ? 'border-[#0F4C81] bg-sky-50 text-[#0F4C81]'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Cloud className="h-4 w-4 text-[#0284C7] shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">Cloud Sync</span>
            <span className="sm:hidden">Sync</span>
          </button>

          <button
            type="button"
            onClick={onTriggerUpload}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-[#0F4C81] px-3 sm:px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0c3d68] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F4C81] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">Upload Textbook PDF</span>
            <span className="sm:hidden">Upload PDF</span>
          </button>
        </div>
      </div>

      {/* Row 2: Simple 8-Item Medical Learning Navigation */}
      <div className="border-t border-slate-100 bg-[#F8FAFC]">
        <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
          <nav
            aria-label="Primary learning navigation"
            className="flex items-center gap-1 overflow-x-auto py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {navItems.map(({ id, label, badge, Icon }) => {
              const isActive = normalizedActiveTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectTab(id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-[13px] font-semibold transition-colors whitespace-nowrap shrink-0 tabular-nums cursor-pointer ${
                    isActive
                      ? 'bg-[#0F4C81] text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-white hover:text-[#0F4C81]'
                  }`}
                >
                  <Icon
                    className={`h-3.5 w-3.5 shrink-0 ${
                      isActive ? 'text-sky-200' : 'text-[#0284C7]'
                    }`}
                    aria-hidden="true"
                  />
                  <span>{label}</span>
                  {typeof badge === 'number' && badge > 0 && (
                    <span
                      className={`font-mono text-[11px] ${
                        isActive ? 'text-sky-100' : 'text-slate-400'
                      }`}
                    >
                      ({badge})
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
};
