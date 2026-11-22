import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Check,
  CheckCircle2,
  Download,
  Edit3,
  FileDown,
  FileText,
  Film,
  Loader2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  MEDICAL_SUBJECT_OPTIONS,
  type BookUploadProgress,
  type MedicalTextbook,
} from '../types/medical';

interface TextbookLibraryViewProps {
  textbooks: MedicalTextbook[];
  selectedTextbookIds: string[];
  uploadQueue: BookUploadProgress[];
  onToggleSelectTextbook: (id: string) => void;
  onSelectOnlyTextbookAndStudy: (id: string) => void;
  onUpdateTextbookMeta: (id: string, updates: { title: string; subject: string }) => void;
  onOpenBookReader: (book: MedicalTextbook, pageNumber: number) => void;
  onExportBookChapterPdf: (bookId: string) => void;
  onAnimateBookChapter?: (book: MedicalTextbook) => void;
  onDeleteTextbook: (id: string) => void;
  onFilesDropped: (files: File[]) => void;
  onTriggerUpload: () => void;
  onClearCompletedUploads: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const TextbookLibraryView: React.FC<TextbookLibraryViewProps> = ({
  textbooks,
  selectedTextbookIds,
  uploadQueue,
  onToggleSelectTextbook,
  onSelectOnlyTextbookAndStudy,
  onUpdateTextbookMeta,
  onOpenBookReader,
  onExportBookChapterPdf,
  onAnimateBookChapter,
  onDeleteTextbook,
  onFilesDropped,
  onTriggerUpload,
  onClearCompletedUploads,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState<string>('ALL');
  const [editingBookId, setEditingBookId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState<string>('');
  const [draftSubject, setDraftSubject] = useState<string>('Internal Medicine');

  const availableSubjects = useMemo(() => {
    const set = new Set<string>();
    textbooks.forEach((b) => {
      if (b.subject) set.add(b.subject);
    });
    return Array.from(set).sort();
  }, [textbooks]);

  const filteredBooks = useMemo(() => {
    if (subjectFilter === 'ALL') return textbooks;
    return textbooks.filter((b) => (b.subject || 'General Medicine') === subjectFilter);
  }, [textbooks, subjectFilter]);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []).filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    if (files.length > 0) {
      onFilesDropped(files);
    }
  };

  const startEditingBook = (book: MedicalTextbook) => {
    setEditingBookId(book.id);
    setDraftTitle(book.title);
    setDraftSubject(book.subject || 'Internal Medicine');
  };

  const saveEditedBook = (bookId: string) => {
    const cleanTitle = draftTitle.trim();
    if (!cleanTitle) return;
    onUpdateTextbookMeta(bookId, {
      title: cleanTitle,
      subject: draftSubject.trim() || 'Internal Medicine',
    });
    setEditingBookId(null);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#0F4C81]">
            Multi-Book Medical Library
          </h1>
          <p className="mt-1 text-sm text-slate-600 max-w-2xl">
            Upload multiple medical textbook PDFs, organize them by title and specialty subject, index each volume independently on-device, and select one or multiple books as Tutor sources.
          </p>
        </div>

        <a
          href="/sample-medical-compendium.pdf"
          download="Sample_Medical_Compendium.pdf"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="h-4 w-4 text-[#0284C7] shrink-0" aria-hidden="true" />
          <span>Download Sample Medical PDF</span>
        </a>
      </div>

      {/* Multi-PDF Upload Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`rounded-2xl border-2 border-dashed p-6 sm:p-8 text-center transition-colors ${
          isDragging
            ? 'border-[#0284C7] bg-sky-50/70'
            : 'border-slate-300 bg-white hover:border-slate-400'
        }`}
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sky-50 text-[#0F4C81]">
          <Upload className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="mt-3 text-base font-bold text-slate-900">
          Upload One or Multiple Medical Textbook PDFs
        </h2>
        <p className="mt-1 text-xs sm:text-sm text-slate-600 max-w-lg mx-auto">
          Select multiple PDF textbooks or chapter handouts at once. Each book is indexed page-by-page independently and stored offline in IndexedDB.
        </p>

        <div className="mt-5">
          <button
            type="button"
            onClick={onTriggerUpload}
            className="inline-flex min-h-[48px] items-center gap-2 rounded-lg bg-[#0F4C81] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0c3d68] transition-colors"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            <span>Choose PDF Textbooks</span>
          </button>
        </div>
      </div>

      {/* Independent Per-Book Indexing Progress Queue */}
      {uploadQueue.length > 0 && (
        <section
          aria-label="PDF indexing progress"
          className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900">
              Independent Book Indexing Queue ({uploadQueue.length})
            </h2>
            {uploadQueue.every((u) => u.status === 'ready' || u.status === 'error') && (
              <button
                type="button"
                onClick={onClearCompletedUploads}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800"
              >
                Dismiss Queue
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-100">
            {uploadQueue.map((item) => {
              const pct =
                item.status === 'ready'
                  ? 100
                  : item.totalPages > 0
                    ? Math.min(100, Math.round((item.currentPage / item.totalPages) * 100))
                    : 0;

              return (
                <div key={item.id} className="py-3 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-900 inline-flex items-center gap-2 min-w-0 max-w-full">
                      {item.status === 'indexing' || item.status === 'queued' ? (
                        <Loader2
                          className="h-3.5 w-3.5 animate-spin text-[#0284C7] shrink-0"
                          aria-hidden="true"
                        />
                      ) : item.status === 'ready' ? (
                        <CheckCircle2
                          className="h-3.5 w-3.5 text-emerald-700 shrink-0"
                          aria-hidden="true"
                        />
                      ) : (
                        <AlertCircle
                          className="h-3.5 w-3.5 text-red-600 shrink-0"
                          aria-hidden="true"
                        />
                      )}
                      <span className="truncate">{item.fileName}</span>
                      {item.subject && (
                        <span className="text-slate-500 font-normal shrink-0">· {item.subject}</span>
                      )}
                    </span>

                    <span className="font-mono text-slate-600 tabular-nums">
                      {item.status === 'queued' && 'Queued...'}
                      {item.status === 'indexing' &&
                        (item.totalPages > 0
                          ? `Page ${item.currentPage} of ${item.totalPages} (${pct}%)`
                          : 'Reading PDF header...')}
                      {item.status === 'ready' &&
                        `Indexed ${item.totalPages} pages (100%)`}
                      {item.status === 'error' && 'Indexing Failed'}
                    </span>
                  </div>

                  <progress
                    aria-label={`Indexing progress for ${item.fileName}`}
                    value={item.status === 'error' ? 100 : pct}
                    max={100}
                    className={`block h-2 w-full overflow-hidden rounded-full bg-slate-100 [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-slate-100 [&::-webkit-progress-value]:rounded-full ${
                      item.status === 'error'
                        ? '[&::-webkit-progress-value]:bg-red-500 [&::-moz-progress-bar]:bg-red-500'
                        : item.status === 'ready'
                          ? '[&::-webkit-progress-value]:bg-emerald-600 [&::-moz-progress-bar]:bg-emerald-600'
                          : '[&::-webkit-progress-value]:bg-[#0284C7] [&::-moz-progress-bar]:bg-[#0284C7]'
                    }`}
                  />

                  {item.errorMessage && (
                    <p className="text-xs text-red-700">{item.errorMessage}</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Subject Filter + Indexed Textbooks Grid */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900 tabular-nums">
            Indexed Medical Textbooks ({filteredBooks.length}
            {subjectFilter !== 'ALL' ? ` in ${subjectFilter}` : ''}) ·{' '}
            <span className="text-[#0F4C81]">
              {selectedTextbookIds.length} active in Tutor
            </span>
          </h2>

          {/* Subject Filter Buttons */}
          {availableSubjects.length > 0 && (
            <div
              role="group"
              aria-label="Filter textbooks by medical subject"
              className="flex flex-wrap items-center gap-1.5"
            >
              <button
                type="button"
                aria-pressed={subjectFilter === 'ALL'}
                onClick={() => setSubjectFilter('ALL')}
                className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  subjectFilter === 'ALL'
                    ? 'bg-[#0F4C81] text-white'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                All Subjects ({textbooks.length})
              </button>
              {availableSubjects.map((subj) => (
                <button
                  key={subj}
                  type="button"
                  aria-pressed={subjectFilter === subj}
                  onClick={() => setSubjectFilter(subj)}
                  className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    subjectFilter === subj
                      ? 'bg-[#0F4C81] text-white'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {subj}
                </button>
              ))}
            </div>
          )}
        </div>

        {filteredBooks.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
            No textbooks match this subject filter. Upload a PDF above or switch to &ldquo;All Subjects&rdquo;.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredBooks.map((book) => {
              const isSelected = selectedTextbookIds.includes(book.id);
              const isEditing = editingBookId === book.id;
              const uploadedDate = new Date(book.uploadedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              });

              return (
                <article
                  key={book.id}
                  className={`rounded-2xl border bg-white p-5 sm:p-6 flex flex-col justify-between gap-4 ${
                    isSelected ? 'border-[#0F4C81]' : 'border-slate-200'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-[#0F4C81] shrink-0">
                          <FileText className="h-5 w-5" aria-hidden="true" />
                        </div>

                        {isEditing ? (
                          <div className="flex-1 space-y-2">
                            <div>
                              <label
                                htmlFor={`edit-title-${book.id}`}
                                className="block text-[11px] font-bold text-slate-600 mb-0.5"
                              >
                                Book Title
                              </label>
                              <input
                                id={`edit-title-${book.id}`}
                                type="text"
                                value={draftTitle}
                                onChange={(e) => setDraftTitle(e.target.value)}
                                className="w-full min-h-[38px] rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs sm:text-sm font-semibold text-slate-900"
                              />
                            </div>
                            <div>
                              <label
                                htmlFor={`edit-subject-${book.id}`}
                                className="block text-[11px] font-bold text-slate-600 mb-0.5"
                              >
                                Medical Subject
                              </label>
                              <select
                                id={`edit-subject-${book.id}`}
                                value={draftSubject}
                                onChange={(e) => setDraftSubject(e.target.value)}
                                className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs sm:text-sm text-slate-900"
                              >
                                {MEDICAL_SUBJECT_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => saveEditedBook(book.id)}
                                className="min-h-[34px] rounded-lg bg-[#0F4C81] px-3 py-1 text-xs font-semibold text-white hover:bg-[#0c3d68]"
                              >
                                Save Details
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingBookId(null)}
                                className="min-h-[34px] inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                              >
                                <X className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Cancel</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-[#0284C7]">
                              {book.subject || 'Internal Medicine'}
                            </p>
                            <h3 className="mt-0.5 text-base font-bold text-slate-900 leading-snug">
                              {book.title}
                            </h3>
                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                              <span>{book.pageCount} indexed pages</span>
                              {book.passageCount ? (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>{book.passageCount} passages</span>
                                </>
                              ) : null}
                              <span aria-hidden="true">·</span>
                              <span>{formatBytes(book.fileSizeBytes)}</span>
                              <span aria-hidden="true">·</span>
                              <span>Added {uploadedDate}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {!isEditing && (
                        <div className="flex items-center gap-1 -mr-2 -mt-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => startEditingBook(book)}
                            aria-label={`Edit title and subject for ${book.title}`}
                            className="flex min-h-[42px] min-w-[42px] items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-[#0F4C81] transition-colors"
                          >
                            <Edit3 className="h-4 w-4" aria-hidden="true" />
                          </button>

                          {textbooks.length > 1 && (
                            <button
                              type="button"
                              onClick={() => onDeleteTextbook(book.id)}
                              aria-label={`Remove textbook ${book.title}`}
                              className="flex min-h-[42px] min-w-[42px] items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {book.scanNotice && (
                      <p className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
                        {book.scanNotice}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => onToggleSelectTextbook(book.id)}
                      className={`inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                        isSelected
                          ? 'bg-[#0F4C81] text-white hover:bg-[#0c3d68]'
                          : 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      {isSelected && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                      <span>{isSelected ? 'Selected Source' : 'Include in Sources'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onSelectOnlyTextbookAndStudy(book.id)}
                      className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
                    >
                      <span>Open in Tutor</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenBookReader(book, 1)}
                      className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-[#0F4C81] hover:bg-sky-50 transition-colors whitespace-nowrap"
                    >
                      <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>Read Pages</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onExportBookChapterPdf(book.id)}
                      className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50/60 px-3.5 py-2 text-xs font-semibold text-[#0F4C81] hover:bg-sky-100 transition-colors whitespace-nowrap"
                    >
                      <FileDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>Chapter PDF</span>
                    </button>

                    {onAnimateBookChapter && (
                      <button
                        type="button"
                        onClick={() => onAnimateBookChapter(book)}
                        className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#0284C7] hover:bg-sky-50 transition-colors whitespace-nowrap"
                      >
                        <Film className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>Animate Chapter</span>
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
