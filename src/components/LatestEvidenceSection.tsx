import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Info,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import type { ExternalEvidenceItem, ExternalEvidenceResponse } from '../types/medical';
import { buildExternalMedicalLinks } from '../utils/visualLayout';

export type EvidenceFilter = 'all' | 'guidelines' | 'agency' | 'trials';

interface LatestEvidenceSectionProps {
  topic: string;
  isOnline: boolean;
  initialFilter?: EvidenceFilter;
  initialItems?: ExternalEvidenceItem[];
  onEvidenceLoaded?: (items: ExternalEvidenceItem[], fetchedTopic?: string) => void;
}

export const LatestEvidenceSection: React.FC<LatestEvidenceSectionProps> = ({
  topic,
  isOnline,
  initialFilter = 'all',
  initialItems,
  onEvidenceLoaded,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>(topic);
  const [activeFilter, setActiveFilter] = useState<EvidenceFilter>(initialFilter);
  const [loading, setLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [evidenceData, setEvidenceData] = useState<ExternalEvidenceResponse | null>(() =>
    initialItems && initialItems.length > 0
      ? {
          query: topic,
          fetchedAt: new Date().toISOString(),
          ncbiApiKeyConfigured: false,
          items: initialItems,
          externalPortals: buildExternalMedicalLinks(topic),
        }
      : null
  );
  const [showCapabilitiesNote, setShowCapabilitiesNote] = useState<boolean>(false);

  // Store parent callback & current evidence existence in refs so parent state updates
  // never re-trigger the automatic search effect or create a re-render/fetch loop.
  const onEvidenceLoadedRef = useRef(onEvidenceLoaded);
  useEffect(() => {
    onEvidenceLoadedRef.current = onEvidenceLoaded;
  }, [onEvidenceLoaded]);

  const hasDataRef = useRef(Boolean(evidenceData && evidenceData.items.length > 0));
  useEffect(() => {
    hasDataRef.current = Boolean(evidenceData && evidenceData.items.length > 0);
  }, [evidenceData]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastAutoFetchedKeyRef = useRef<string>('');

  useEffect(() => {
    setSearchQuery(topic);
  }, [topic]);

  useEffect(() => {
    setActiveFilter(initialFilter);
  }, [initialFilter]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const runEvidenceSearch = useCallback(async (queryText: string) => {
    const clean = queryText.trim();
    if (!clean || clean.length < 2) {
      setError('Enter at least 2 characters to search medical literature.');
      return;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setError(
        'Offline mode active — reconnect to query live PubMed, NIH MedlinePlus, and ClinicalTrials.gov records.'
      );
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (hasDataRef.current) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const res = await fetch(`/api/evidence/search?topic=${encodeURIComponent(clean)}`, {
        signal: controller.signal,
      });
      const payload = await res.json().catch(() => ({}));
      if (controller.signal.aborted) return;
      if (!res.ok) {
        throw new Error(payload.error || 'Unable to fetch external medical evidence.');
      }
      const typedPayload = payload as ExternalEvidenceResponse;
      setEvidenceData(typedPayload);
      if (onEvidenceLoadedRef.current && Array.isArray(typedPayload.items)) {
        onEvidenceLoadedRef.current(typedPayload.items, clean);
      }
    } catch (err) {
      if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
        return;
      }
      setError(
        err instanceof Error ? err.message : 'Unable to fetch external medical evidence.'
      );
    } finally {
      if (abortControllerRef.current === controller) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    const cleanTopic = topic.trim();
    if (!isOnline || cleanTopic.length < 2) return;
    const autoKey = `${cleanTopic.toLowerCase()}::online`;
    if (lastAutoFetchedKeyRef.current === autoKey) return;
    lastAutoFetchedKeyRef.current = autoKey;
    void runEvidenceSearch(cleanTopic);
  }, [topic, isOnline, runEvidenceSearch]);

  const portals = evidenceData?.externalPortals || buildExternalMedicalLinks(searchQuery || topic);
  const allItems: ExternalEvidenceItem[] = evidenceData?.items || [];

  const filteredItems = allItems.filter((item) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'guidelines') {
      return (
        item.evidenceType === 'Clinical Practice Guideline' ||
        item.evidenceType === 'Systematic Review / Meta-Analysis' ||
        item.evidenceType === 'Randomized Controlled Trial' ||
        item.database === 'PubMed'
      );
    }
    if (activeFilter === 'agency') {
      return item.database === 'NIH MedlinePlus';
    }
    if (activeFilter === 'trials') {
      return item.database === 'ClinicalTrials.gov';
    }
    return true;
  });

  return (
    <section
      aria-labelledby="latest-evidence-heading"
      className="space-y-6"
      data-testid="latest-evidence-section"
    >
      {/* Distinct Provenance Header */}
      <div className="border-b border-slate-200 pb-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="latest-evidence-heading" className="text-xl font-bold text-[#0F4C81]">
            Latest External Medical Evidence &amp; Guidelines
          </h3>
          <span className="text-xs font-semibold text-teal-800">
            External Authorized Sources · Separate from Uploaded Textbook
          </span>
        </div>
        <p className="text-xs sm:text-sm leading-relaxed text-slate-600 max-w-[76ch]">
          Live literature and clinical guidance retrieved directly from authorized public databases (
          <strong>NCBI PubMed</strong>, <strong>U.S. NIH MedlinePlus</strong>, and{' '}
          <strong>ClinicalTrials.gov</strong>). Items below reflect external clinical publications and are never mixed with your uploaded textbook&apos;s page citations.
        </p>
      </div>

      {/* Compliant UpToDate External Launch + Official Guideline Portals */}
      <div className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5 max-w-[64ch]">
            <p className="text-xs font-bold text-slate-900">
              External Clinical Decision Support &amp; Society Portals
            </p>
            <p className="text-xs text-slate-600 leading-relaxed">
              UpToDate requires an institutional or personal subscription; no unauthorized UpToDate API is configured and restricted content is never scraped or copied. Open the topic directly on UpToDate.com or browse open guideline portals:
            </p>
          </div>

          <a
            href={portals.upToDateUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg bg-[#0F4C81] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0c3d68] transition-colors whitespace-nowrap shrink-0"
          >
            <span>Open on UpToDate.com</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </a>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2 border-t border-slate-200/80 text-xs">
          <span className="text-slate-500 font-medium">Open Guideline Portals:</span>
          <a
            href={portals.pubMedGuidelinesUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-[#0284C7] hover:underline whitespace-nowrap"
          >
            <span>PubMed Practice Guidelines</span>
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
          <a
            href={portals.niceGuidelinesUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-[#0284C7] hover:underline whitespace-nowrap"
          >
            <span>NICE Clinical Guidance</span>
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
          <a
            href={portals.whoGuidelinesUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-[#0284C7] hover:underline whitespace-nowrap"
          >
            <span>WHO Publications</span>
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
          <a
            href={portals.medlinePlusUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-[#0284C7] hover:underline whitespace-nowrap"
          >
            <span>NIH MedlinePlus</span>
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </div>
      </div>

      {/* Live Literature Search Bar & Filter Tabs */}
      <div className="space-y-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runEvidenceSearch(searchQuery);
          }}
          className="flex flex-col sm:flex-row gap-2.5"
        >
          <div className="relative flex-1">
            <label htmlFor="evidence-topic-search" className="sr-only">
              Search PubMed, NIH MedlinePlus, and ClinicalTrials.gov
            </label>
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
              aria-hidden="true"
            />
            <input
              id="evidence-topic-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search guidelines, systematic reviews, or clinical trials..."
              className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white pl-10 pr-3.5 py-2 text-sm text-slate-900 focus:border-[#0F4C81] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !isOnline}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-[#0F4C81] bg-white px-4 py-2 text-xs sm:text-sm font-semibold text-[#0F4C81] hover:bg-sky-50 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            <span>Search Live Evidence</span>
          </button>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            role="tablist"
            aria-label="Filter external evidence by source type"
            className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1"
          >
            {(
              [
                { id: 'all', label: `All (${allItems.length})` },
                { id: 'guidelines', label: 'PubMed & Guidelines' },
                { id: 'agency', label: 'NIH Health Agency' },
                { id: 'trials', label: 'Phase 3/4 Trials' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeFilter === tab.id}
                onClick={() => setActiveFilter(tab.id)}
                className={`min-h-[34px] rounded-md px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap tabular-nums ${
                  activeFilter === tab.id
                    ? 'bg-white text-[#0F4C81] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2.5 text-xs text-slate-500 font-mono tabular-nums">
            {isRefreshing && (
              <span className="inline-flex items-center gap-1.5 text-[#0284C7] font-sans font-medium">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                <span>Updating...</span>
              </span>
            )}
            {evidenceData && (
              <span>
                {filteredItems.length} result{filteredItems.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Results Stream (Editorial Hairline List — Zero Nested Box Clutter) */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50/70 p-3.5 text-xs sm:text-sm text-amber-950"
        >
          <AlertCircle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center space-y-2" role="status" aria-live="polite">
          <Loader2 className="h-6 w-6 animate-spin text-[#0F4C81] mx-auto" aria-hidden="true" />
          <p className="text-sm font-medium text-slate-700">
            Querying NCBI PubMed, NIH MedlinePlus &amp; ClinicalTrials.gov...
          </p>
        </div>
      ) : filteredItems.length > 0 ? (
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {filteredItems.map((item) => (
            <article key={item.id} className="py-4 space-y-1.5">
              {/* Unboxed Editorial Metadata Line */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                <span className="font-bold text-teal-800">{item.evidenceType}</span>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-slate-700">{item.sourceOrgOrJournal}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">{item.publishedDate}</span>
                <span aria-hidden="true">·</span>
                <span>{item.database}</span>
              </div>

              <h4 className="text-sm sm:text-base font-bold text-[#0F4C81] leading-snug">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline inline-flex items-baseline gap-1.5"
                >
                  <span>{item.title}</span>
                  <ExternalLink
                    className="h-3.5 w-3.5 text-[#0284C7] shrink-0 self-center"
                    aria-hidden="true"
                  />
                </a>
              </h4>

              <p className="text-xs sm:text-sm leading-relaxed text-slate-700 max-w-[78ch]">
                {item.summarySnippet}
              </p>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 font-mono min-w-0">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-sans font-semibold text-[#0284C7] hover:underline break-words"
                >
                  Open Source Record ({item.pmid ? `PMID ${item.pmid}` : item.nctId || item.database})
                </a>
                {item.doi && <span className="break-all">DOI: {item.doi}</span>}
              </div>
            </article>
          ))}
        </div>
      ) : (
        !loading &&
        !error && (
          <div className="py-8 text-center text-sm text-slate-500 border-y border-slate-200">
            No matching external records found for this filter. Broaden the search query above or select &ldquo;All&rdquo;.
          </div>
        )
      )}

      {/* Honest Capabilities, API Keys & Licensing Transparency Disclosure */}
      <div className="pt-2">
        <button
          type="button"
          aria-expanded={showCapabilitiesNote}
          onClick={() => setShowCapabilitiesNote((v) => !v)}
          className="inline-flex min-h-[38px] items-center gap-2 text-xs font-semibold text-slate-600 hover:text-[#0F4C81] transition-colors"
        >
          <ShieldCheck className="h-4 w-4 text-[#0284C7]" aria-hidden="true" />
          <span>Platform Capabilities, API Keys &amp; Licensing Status</span>
          {showCapabilitiesNote ? (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>

        {showCapabilitiesNote && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-[#F8FAFC] p-4 text-xs leading-relaxed text-slate-700 space-y-2.5">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-[#0F4C81] shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-2">
                <p>
                  <strong className="font-bold text-slate-900">
                    1. Works Out-of-the-Box (No Paid Subscription Required):
                  </strong>{' '}
                  Full-book PDF upload &amp; passage retrieval, interactive SVG Mind Maps, Flowcharts &amp; Anatomical Diagrams (with SVG/PNG export), Step-by-Step + Quick Revision modes, Flashcards, Clinical Cases, MCQs, Offline PWA storage, AES-256-GCM Cloud Vault sync, and live literature searches across NCBI PubMed (3 req/s public limit), NIH MedlinePlus, and ClinicalTrials.gov.
                </p>
                <p>
                  <strong className="font-bold text-slate-900">
                    2. Server-Side API Keys (Settings &gt; Secrets):
                  </strong>{' '}
                  AI study guide synthesis and Egyptian Arabic explanations run via <code className="font-mono">GEMINI_API_KEY</code> on the server. Optional <code className="font-mono">NCBI_API_KEY</code> ({evidenceData?.ncbiApiKeyConfigured ? 'configured — 10 req/s active' : 'optional — currently using 3 req/s public tier'}) can be added in <strong>Settings &gt; Secrets</strong> to increase PubMed rate limits to 10 requests/second.
                </p>
                <p>
                  <strong className="font-bold text-slate-900">
                    3. Licensed External Services:
                  </strong>{' '}
                  <strong>UpToDate</strong> (Wolters Kluwer) requires a paid personal or institutional license and an enterprise partner contract for API access. MedAtlas Tutor never scrapes or copies restricted UpToDate content; use the external button above to open your licensed UpToDate account directly.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
