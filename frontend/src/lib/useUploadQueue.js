import { useCallback, useMemo, useRef, useState } from 'react';

const API_BASE = '/emly/api/prediction';
const CHUNK_SIZE = 5 * 1024 * 1024;
const MAX_RETRIES = 3;
const ALLOWED_UPLOAD_EXTENSIONS = new Set(['.csv', '.xlsx', '.xls', '.json', '.zip']);

function getFileExtension(filename) {
  const name = String(filename || '').trim();
  const dotIndex = name.lastIndexOf('.');
  if (dotIndex < 0) return '';
  return name.slice(dotIndex).toLowerCase();
}

function createLocalFileId(file, folder) {
  return `${file.name}:${file.size}:${file.lastModified}:${folder || 'default'}`;
}

async function parseJsonResponse(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || 'Upload request failed');
  return body;
}

function buildQueueItems(files, folder) {
  return Array.from(files || [])
    .filter((file) => ALLOWED_UPLOAD_EXTENSIONS.has(getFileExtension(file?.name)))
    .map((file) => ({
    localId: createLocalFileId(file, folder),
    file,
    filename: file.name,
    folder: folder || 'default',
    status: 'queued',
    message: 'Queued',
    progress: 0,
    uploadedBytes: 0,
    totalBytes: file.size,
    uploadId: null,
    dataset: null,
    error: '',
  }));
}

export function useUploadQueue({ onUploadCompleted } = {}) {
  const [items, setItems] = useState([]);
  const [running, setRunning] = useState(false);
  const abortRequestedRef = useRef(false);
  const itemsRef = useRef([]);
  const activeControllersRef = useRef(new Set());

  const setItemsSynced = useCallback((updater) => {
    setItems((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      itemsRef.current = next;
      return next;
    });
  }, []);

  const updateItem = useCallback((localId, patch) => {
    setItemsSynced((prev) => prev.map((item) => (item.localId === localId ? { ...item, ...patch } : item)));
  }, [setItemsSynced]);

  const getItem = useCallback((localId) => itemsRef.current.find((item) => item.localId === localId), []);

  const initSession = useCallback(async (item) => {
    const controller = new AbortController();
    activeControllersRef.current.add(controller);
    const resumeKey = `upload:${item.localId}`;
    try {
      const res = await fetch(`${API_BASE}/upload/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: item.file.name,
          file_size: item.file.size,
          folder: item.folder || 'default',
          content_type: item.file.type || null,
          chunk_size: CHUNK_SIZE,
          resume_key: resumeKey,
        }),
        signal: controller.signal,
      });
      return parseJsonResponse(res);
    } finally {
      activeControllersRef.current.delete(controller);
    }
  }, []);

  const sendChunkWithRetry = useCallback(async (uploadId, chunkIndex, blob) => {
    let attempt = 0;
    while (attempt < MAX_RETRIES) {
      const controller = new AbortController();
      activeControllersRef.current.add(controller);
      try {
        const formData = new FormData();
        formData.append('chunk_index', String(chunkIndex));
        formData.append('chunk', blob, `chunk_${chunkIndex}.part`);
        const res = await fetch(`${API_BASE}/upload/chunk/${encodeURIComponent(uploadId)}`, {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });
        return await parseJsonResponse(res);
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
        attempt += 1;
        if (attempt >= MAX_RETRIES) throw err;
      } finally {
        activeControllersRef.current.delete(controller);
      }
    }
    throw new Error('Chunk upload failed');
  }, []);

  const runUploadItem = useCallback(async (localId) => {
    const item = getItem(localId);
    if (!item || item.status === 'completed') return;
    if (abortRequestedRef.current) {
      updateItem(localId, { status: 'paused', message: 'Paused by user. Resume from status window.' });
      return;
    }

    updateItem(localId, {
      status: 'initializing',
      message: 'Initializing upload session',
      progress: 1,
      error: '',
    });

    const initBody = await initSession(item);
    const uploadId = initBody.upload_id;
    let nextChunkIndex = Number(initBody.next_chunk_index || 0);
    let uploadedBytes = Number(initBody.uploaded_bytes || 0);
    const totalBytes = Number(initBody.total_bytes || item.file.size || 0);

    updateItem(localId, {
      uploadId,
      status: initBody.status || 'uploading',
      message: initBody.message || 'Uploading chunks',
      progress: Number(initBody.progress || 0),
      uploadedBytes,
      totalBytes,
    });

    const totalChunks = Math.ceil(item.file.size / CHUNK_SIZE);
    while (nextChunkIndex < totalChunks) {
      if (abortRequestedRef.current) {
        updateItem(localId, {
          status: 'paused',
          message: 'Paused by user. Resume from status window.',
        });
        return;
      }
      const start = nextChunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, item.file.size);
      const chunkBlob = item.file.slice(start, end);
      const chunkBody = await sendChunkWithRetry(uploadId, nextChunkIndex, chunkBlob);
      nextChunkIndex = Number(chunkBody.next_chunk_index || (nextChunkIndex + 1));
      uploadedBytes = Number(chunkBody.uploaded_bytes || end);

      updateItem(localId, {
        status: chunkBody.status || 'uploading',
        message: chunkBody.message || 'Uploading chunks',
        progress: Number(chunkBody.progress || 0),
        uploadedBytes,
        totalBytes: Number(chunkBody.total_bytes || totalBytes),
      });
    }

    updateItem(localId, {
      status: 'processing',
      message: 'Upload complete. Processing dataset...',
      progress: 90,
    });

    const completeController = new AbortController();
    activeControllersRef.current.add(completeController);
    let completeRes;
    try {
      completeRes = await fetch(`${API_BASE}/upload/complete/${encodeURIComponent(uploadId)}`, {
        method: 'POST',
        signal: completeController.signal,
      });
    } finally {
      activeControllersRef.current.delete(completeController);
    }
    const completeBody = await parseJsonResponse(completeRes);
    const result = completeBody.result || null;

    updateItem(localId, {
      status: completeBody.status || 'completed',
      message: completeBody.message || 'Completed',
      progress: Number(completeBody.progress || 100),
      uploadedBytes: Number(completeBody.uploaded_bytes || totalBytes),
      totalBytes: Number(completeBody.total_bytes || totalBytes),
      dataset: result,
      error: '',
    });

    if (result && onUploadCompleted) {
      await onUploadCompleted(result);
    }
  }, [getItem, initSession, onUploadCompleted, sendChunkWithRetry, updateItem]);

  const runBatch = useCallback(async (localIds) => {
    if (!localIds.length) return;
    setRunning(true);
    for (const localId of localIds) {
      if (abortRequestedRef.current) break;
      try {
        await runUploadItem(localId);
      } catch (err) {
        if (err?.name === 'AbortError' || abortRequestedRef.current) {
          updateItem(localId, {
            status: 'paused',
            message: 'Paused by user. Resume from status window.',
            error: '',
          });
          continue;
        }
        updateItem(localId, {
          status: 'failed',
          message: 'Upload failed',
          error: err?.message || 'Upload failed',
        });
      }
    }
    setRunning(false);
    abortRequestedRef.current = false;
  }, [runUploadItem, updateItem]);

  const startUploads = useCallback(async (files, folder) => {
    if (running) return false;
    const nextItems = buildQueueItems(files, folder || 'default');
    if (!nextItems.length) return false;
    abortRequestedRef.current = false;
    setItemsSynced((prev) => {
      const completed = prev.filter((item) => item.status === 'completed');
      return [...completed, ...nextItems];
    });
    await runBatch(nextItems.map((item) => item.localId));
    return true;
  }, [runBatch, running, setItemsSynced]);

  const resumeFailedOrPaused = useCallback(async () => {
    if (running) return;
    abortRequestedRef.current = false;
    const resumable = itemsRef.current
      .filter((item) => ['failed', 'paused'].includes(item.status))
      .map((item) => item.localId);
    await runBatch(resumable);
  }, [runBatch, running]);

  const pauseAll = useCallback(() => {
    abortRequestedRef.current = true;
    activeControllersRef.current.forEach((controller) => controller.abort());
    setItemsSynced((prev) => prev.map((item) => (
      ['queued', 'initializing', 'uploading', 'processing'].includes(item.status)
        ? { ...item, status: 'paused', message: 'Paused by user. Resume from status window.', error: '' }
        : item
    )));
  }, []);

  const clearCompleted = useCallback(() => {
    if (running) return;
    setItemsSynced((prev) => prev.filter((item) => item.status !== 'completed'));
  }, [running, setItemsSynced]);

  const overallProgress = useMemo(() => {
    if (!items.length) return 0;
    const sum = items.reduce((acc, item) => acc + Number(item.progress || 0), 0);
    return Math.round(sum / items.length);
  }, [items]);

  const hasPending = useMemo(
    () => items.some((item) => ['queued', 'initializing', 'uploading', 'processing'].includes(item.status)),
    [items],
  );

  const hasResumable = useMemo(
    () => items.some((item) => ['failed', 'paused'].includes(item.status)),
    [items],
  );

  return {
    items,
    running,
    overallProgress,
    hasPending,
    hasResumable,
    startUploads,
    resumeFailedOrPaused,
    pauseAll,
    clearCompleted,
  };
}
