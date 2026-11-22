import type { LectureProject } from '../types/medical';
import { INITIAL_SAMPLE_LECTURE, normalizeLectureScenes } from './lectureStudioEngine';

const LECTURE_DB_NAME = 'medatlas_lectures_db_v1';
const LECTURE_DB_VERSION = 1;
const STORE_LECTURES = 'lectures';
const SEEDED_LECTURE_KEY = 'medatlas_seeded_lecture_v1';

function openLectureDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(LECTURE_DB_NAME, LECTURE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_LECTURES)) {
        db.createObjectStore(STORE_LECTURES, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function sanitizeProjectForStorage(project: LectureProject): LectureProject {
  // Persist verified 24kHz WAV narration in IndexedDB so synthesized scenes stay ready across reloads
  return {
    ...project,
    scenes: project.scenes.map(({ audioError: _transientErr, ...rest }) => rest),
  };
}

export async function loadSavedLectures(): Promise<LectureProject[]> {
  try {
    const db = await openLectureDb();
    const list = await new Promise<LectureProject[]>((resolve, reject) => {
      const tx = db.transaction(STORE_LECTURES, 'readonly');
      const store = tx.objectStore(STORE_LECTURES);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as LectureProject[]) || []);
      req.onerror = () => reject(req.error);
    });

    const alreadySeeded = localStorage.getItem(SEEDED_LECTURE_KEY) === '1';
    if (!alreadySeeded && list.length === 0) {
      await saveLectureOffline(INITIAL_SAMPLE_LECTURE);
      localStorage.setItem(SEEDED_LECTURE_KEY, '1');
      return [INITIAL_SAMPLE_LECTURE];
    }

    const hydrated = list.map((proj) => {
      const defaultSys = proj.scenes[0]?.systemTemplate || 'cardiopulmonary';
      const upgradedScenes = proj.scenes.map((sc) => {
        if (proj.id === 'sample-lecture-hfref-v1') {
          if (sc.id === 'sample-lec-scene-3' && sc.visualMode === 'clinical_flow') {
            return { ...sc, visualMode: 'comparison' as const };
          }
          if (sc.id === 'sample-lec-scene-4' && sc.visualMode === 'clinical_flow') {
            return { ...sc, visualMode: 'treatment' as const };
          }
        }
        return sc;
      });
      return {
        ...proj,
        scenes: normalizeLectureScenes(
          proj.topic,
          defaultSys,
          upgradedScenes,
          proj.externalReferences || []
        ),
      };
    });

    hydrated.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return hydrated;
  } catch {
    return [INITIAL_SAMPLE_LECTURE];
  }
}

export async function saveLectureOffline(project: LectureProject): Promise<void> {
  try {
    const db = await openLectureDb();
    const cleaned = sanitizeProjectForStorage(project);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_LECTURES, 'readwrite');
      tx.objectStore(STORE_LECTURES).put(cleaned);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore storage quota or private-mode errors
  }
}

export async function deleteLectureOffline(id: string): Promise<void> {
  try {
    const db = await openLectureDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_LECTURES, 'readwrite');
      tx.objectStore(STORE_LECTURES).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore
  }
}
