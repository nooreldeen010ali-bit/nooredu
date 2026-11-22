import React, { useEffect, useState } from 'react';
import { FlaskConical, Scale } from 'lucide-react';
import type { ExternalEvidenceItem, StudyGuide } from '../types/medical';
import { LatestEvidenceSection } from './LatestEvidenceSection';

interface EvidenceHubViewProps {
  mode: 'research' | 'guidelines';
  activeTopic: string;
  studyGuides: StudyGuide[];
  isOnline: boolean;
  onEvidenceLoaded?: (items: ExternalEvidenceItem[], fetchedTopic?: string) => void;
}

const QUICK_EVIDENCE_TOPICS = [
  'Peptic Ulcer Disease',
  'Heart Failure',
  'Diabetic Ketoacidosis',
  'Sepsis',
  'Acute Kidney Injury',
  'Bronchial Asthma',
];

export const EvidenceHubView: React.FC<EvidenceHubViewProps> = ({
  mode,
  activeTopic,
  studyGuides,
  isOnline,
  onEvidenceLoaded,
}) => {
  const defaultTopic =
    activeTopic.trim() || studyGuides[0]?.topic || 'Peptic Ulcer Disease';
  const [selectedTopic, setSelectedTopic] = useState<string>(defaultTopic);

  useEffect(() => {
    const clean = activeTopic.trim();
    if (clean.length >= 2) {
      setSelectedTopic((prev) => (prev.toLowerCase() === clean.toLowerCase() ? prev : clean));
    }
  }, [activeTopic]);

  const savedTopicNames = studyGuides.map((g) => g.topic);
  const pillTopics = Array.from(
    new Set([...savedTopicNames, ...QUICK_EVIDENCE_TOPICS])
  ).slice(0, 7);

  const isGuidelines = mode === 'guidelines';

  return (
    <div className="space-y-4 w-full max-w-full">
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 space-y-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0284C7]">
            {isGuidelines ? (
              <Scale className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            <span>
              {isGuidelines ? 'Clinical Practice Guidelines' : 'Biomedical Research & Trials'}
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-[#0F4C81] [text-wrap:balance]">
            {isGuidelines
              ? 'Clinical Guidelines & Decision Support'
              : 'Medical Research & Clinical Trials'}
          </h1>

          <p className="text-xs sm:text-sm text-slate-600 max-w-3xl">
            {isGuidelines
              ? 'Browse clinical practice guidelines across PubMed, NICE, WHO, NIH MedlinePlus, and external UpToDate portals.'
              : 'Search peer-reviewed articles, systematic reviews, and clinical trials from PubMed, NIH MedlinePlus, and ClinicalTrials.gov.'}
          </p>
        </div>

        <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-500 mr-1">
            Topic:
          </span>
          {pillTopics.map((t) => {
            const active = selectedTopic.toLowerCase() === t.toLowerCase();
            return (
              <button
                key={t}
                type="button"
                onClick={() => setSelectedTopic(t)}
                className={`min-h-[36px] max-w-full truncate rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-[#0F4C81] text-white'
                    : 'border border-slate-200 bg-[#F8FAFC] text-slate-700 hover:border-[#0284C7] hover:bg-sky-50 hover:text-[#0F4C81]'
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <LatestEvidenceSection
          topic={selectedTopic}
          isOnline={isOnline}
          initialFilter={isGuidelines ? 'guidelines' : 'all'}
          onEvidenceLoaded={onEvidenceLoaded}
        />
      </div>
    </div>
  );
};
