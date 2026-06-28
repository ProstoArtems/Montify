import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { MediaFile, TimelineSegment } from '../types';
import { API_BASE_URL } from '../api';

interface SessionState {
  sessionId: string;
  files: MediaFile[];
  selectedFileId: string | null;
  timelineSegments: TimelineSegment[];
  selectedSegmentId: string | null;
  createSession: () => Promise<string>;
  addFiles: (files: File[]) => Promise<void>;
  removeFile: (fileId: string) => void;
  selectFile: (fileId: string | null) => void;
  addSegment: (segment: Omit<TimelineSegment, 'id'>) => void;
  updateSegment: (segmentId: string, updates: Partial<TimelineSegment>) => void;
  removeSegment: (segmentId: string) => void;
  selectSegment: (segmentId: string | null) => void;
  moveSegment: (segmentId: string, newStart: number) => void;
  reorderSegments: (segmentOrder: string[]) => void;
}

const SessionContext = createContext<SessionState | undefined>(undefined);

function createId() {
  return Math.random().toString(36).slice(2, 10);
}

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sessionId, setSessionId] = useState<string>('');
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [timelineSegments, setTimelineSegments] = useState<TimelineSegment[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/files/session/start`);
        if (res.ok) {
          const json = await res.json();
          if (json && json.sessionId) {
            localStorage.setItem('montify-session-id', json.getSessionId != null ? json.getSessionId : json.sessionId);
            setSessionId(json.getSessionId != null ? json.getSessionId : json.sessionId);
            return;
          }
        }
      } catch (e) {
        // fallback to local id if backend not available
      }

      let saved = localStorage.getItem('montify-session-id');
      if (!saved) {
        saved = createId();
        localStorage.setItem('montify-session-id', saved);
      }
      setSessionId(saved);
    };

    init();
  }, []);

  const createSession = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/files/session/start`);
      if (res.ok) {
        const json = await res.json();
        const newSessionId = json.getSessionId != null ? json.getSessionId : json.sessionId;
        localStorage.setItem('montify-session-id', newSessionId);
        setSessionId(newSessionId);
        setFiles([]);
        setTimelineSegments([]);
        setSelectedFileId(null);
        setSelectedSegmentId(null);
        return newSessionId;
      }
    } catch (e) {
      // fallback if backend unavailable
    }

    const newSessionId = createId();
    localStorage.setItem('montify-session-id', newSessionId);
    setSessionId(newSessionId);
    setFiles([]);
    setTimelineSegments([]);
    setSelectedFileId(null);
    setSelectedSegmentId(null);
    return newSessionId;
  }, []);

  const addFiles = useCallback(async (incoming: File[]) => {
    let activeSessionId = sessionId;
    if (!activeSessionId) {
      activeSessionId = await createSession();
    }

    const uploadedFiles = [] as any[];
    const uploadedSegments: TimelineSegment[] = [];

    for (const file of incoming) {
      try {
        const form = new FormData();
        form.append('file', file);

        console.log('Uploading file with session:', activeSessionId);
        const res = await fetch(`${API_BASE_URL}/api/v1/files/upload`, {
          method: 'POST',
          headers: {
            'X-Session-ID': activeSessionId,
          },
          body: form,
        });

        if (!res.ok) {
          if (res.status === 401) {
            activeSessionId = await createSession();
            const retryRes = await fetch(`${API_BASE_URL}/api/v1/files/upload`, {
              method: 'POST',
              headers: {
                'X-Session-ID': activeSessionId,
              },
              body: form,
            });
            if (!retryRes.ok) {
              throw new Error('Upload failed after retry');
            }
            const retryJson = await retryRes.json();
            const fileKey = retryJson.fileKey;
            const url = `${API_BASE_URL}/api/v1/files/download/${activeSessionId}/${fileKey}`;
            const type = file.type.startsWith('audio') ? 'audio' : 'video';
            const getDuration = (src: string, isVideo: boolean) =>
              new Promise<number>((resolve) => {
                try {
                  const el = document.createElement(isVideo ? 'video' : 'audio');
                  el.preload = 'metadata';
                  el.src = src;
                  const cleanup = () => {
                    el.onloadedmetadata = null;
                    el.onerror = null;
                  };
                  el.onloadedmetadata = () => {
                    const d = Math.round(el.duration || 0);
                    cleanup();
                    resolve(d);
                  };
                  el.onerror = () => {
                    cleanup();
                    resolve(0);
                  };
                } catch (e) {
                  resolve(0);
                }
              });
            const duration = Math.max(await getDuration(url, type === 'video'), 1);
            const fileRecord = {
              id: createId(),
              name: file.name,
              originalFileName: file.name,
              url,
              type,
              size: file.size,
              duration,
              fileKey,
            };
            uploadedFiles.push(fileRecord);
            uploadedSegments.push({
              id: createId(),
              fileId: fileRecord.id,
              fileKey,
              type,
              start: 0,
              end: duration,
            });
            continue;
          }
          throw new Error('Upload failed');
        }

        const json = await res.json();
        const fileKey = json.fileKey;
        const url = `${API_BASE_URL}/api/v1/files/download/${activeSessionId}/${fileKey}`;
        const type = file.type.startsWith('audio') ? 'audio' : 'video';

        const getDuration = (src: string, isVideo: boolean) =>
          new Promise<number>((resolve) => {
            try {
              const el = document.createElement(isVideo ? 'video' : 'audio');
              el.preload = 'metadata';
              el.src = src;
              const cleanup = () => {
                el.onloadedmetadata = null;
                el.onerror = null;
              };
              el.onloadedmetadata = () => {
                const d = Math.round(el.duration || 0);
                cleanup();
                resolve(d);
              };
              el.onerror = () => {
                cleanup();
                resolve(0);
              };
            } catch (e) {
              resolve(0);
            }
          });

        const duration = Math.max(await getDuration(url, type === 'video'), 1);
        const fileRecord = {
          id: createId(),
          name: file.name,
          originalFileName: file.name,
          url,
          type,
          size: file.size,
          duration,
          fileKey,
        };

        uploadedFiles.push(fileRecord);
        uploadedSegments.push({
          id: createId(),
          fileId: fileRecord.id,
          fileKey,
          type,
          start: 0,
          end: duration,
        });
      } catch (e) {
        // fallback: add as local object url
        const url = URL.createObjectURL(file);
        const type = file.type.startsWith('audio') ? 'audio' : 'video';
        const fileRecord = {
          id: createId(),
          name: file.name,
          originalFileName: file.name,
          url,
          type,
          size: file.size,
          duration: undefined,
        };
        uploadedFiles.push(fileRecord);
      }
    }

    setFiles((prev) => [...prev, ...uploadedFiles]);
    setTimelineSegments((prev) => [...prev, ...uploadedSegments]);
    if (!selectedSegmentId && uploadedSegments.length) {
      setSelectedSegmentId(uploadedSegments[0].id);
    }
    if (!selectedFileId && uploadedFiles.length) {
      setSelectedFileId(uploadedFiles[0].id);
    }
  }, [selectedFileId, selectedSegmentId, sessionId, createSession]);

  const removeFile = useCallback((fileId: string) => {
    setFiles((prev) => prev.filter((item) => item.id !== fileId));
    setTimelineSegments((prev) => prev.filter((segment) => segment.fileId !== fileId));
    if (selectedFileId === fileId) {
      setSelectedFileId(null);
    }
    setSelectedSegmentId((currentSegmentId) => {
      if (!currentSegmentId) return null;
      const segmentStillExists = timelineSegments.some((segment) => segment.id === currentSegmentId && segment.fileId !== fileId);
      return segmentStillExists ? currentSegmentId : null;
    });
  }, [selectedFileId, timelineSegments]);

  const selectFile = useCallback((fileId: string | null) => {
    setSelectedFileId(fileId);
  }, []);

  const addSegment = useCallback((segment: Omit<TimelineSegment, 'id'>) => {
    const newSegment = { id: createId(), ...segment };
    setTimelineSegments((prev) => [...prev, newSegment]);
    setSelectedSegmentId(newSegment.id);
  }, []);

  const updateSegment = useCallback((segmentId: string, updates: Partial<TimelineSegment>) => {
    setTimelineSegments((prev) =>
      prev.map((segment) => (segment.id === segmentId ? { ...segment, ...updates } : segment))
    );
  }, []);

  const removeSegment = useCallback((segmentId: string) => {
    setTimelineSegments((prev) => prev.filter((segment) => segment.id !== segmentId));
    setSelectedSegmentId((current) => (current === segmentId ? null : current));
  }, []);

  const selectSegment = useCallback((segmentId: string | null) => {
    setSelectedSegmentId(segmentId);
  }, []);

  const moveSegment = useCallback((segmentId: string, newStart: number) => {
    setTimelineSegments((prev) =>
      prev.map((segment) => (segment.id === segmentId ? { ...segment, start: Math.max(0, newStart) } : segment))
    );
  }, []);

  const reorderSegments = useCallback((segmentOrder: string[]) => {
    setTimelineSegments((prev) => {
      const byId = new Map(prev.map((segment) => [segment.id, segment]));
      return segmentOrder.map((id) => byId.get(id)).filter(Boolean) as TimelineSegment[];
    });
  }, []);

  const value = useMemo(
    () => ({
      sessionId,
      files,
      selectedFileId,
      timelineSegments,
      selectedSegmentId,
      createSession,
      addFiles,
      removeFile,
      selectFile,
      addSegment,
      updateSegment,
      removeSegment,
      selectSegment,
      moveSegment,
      reorderSegments,
    }),
    [
      sessionId,
      files,
      selectedFileId,
      timelineSegments,
      selectedSegmentId,
      createSession,
      addFiles,
      removeFile,
      selectFile,
      addSegment,
      updateSegment,
      removeSegment,
      selectSegment,
      moveSegment,
      reorderSegments,
    ]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within SessionProvider');
  }
  return context;
};
