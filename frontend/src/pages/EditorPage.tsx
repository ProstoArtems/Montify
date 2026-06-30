import { DragEvent, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useSession } from '../context/SessionContext';
import { API_BASE_URL } from '../api';

const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

function EditorPage() {
  const {
    files,
    sessionId,
    selectedFileId,
    selectFile,
    timelineSegments,
    selectedSegmentId,
    selectSegment,
    addSegment,
    updateSegment,
    removeSegment,
    reorderSegments,
  } = useSession();

  const selectedFile = useMemo(() => files.find((file) => file.id === selectedFileId), [files, selectedFileId]);
  const selectedSegment = useMemo(
    () => timelineSegments.find((segment) => segment.id === selectedSegmentId),
    [timelineSegments, selectedSegmentId]
  );
  const selectedSegmentFile = selectedSegment ? files.find((file) => file.id === selectedSegment.fileId) : undefined;

  const sourceVideo = useMemo(
    () => selectedFile?.type === 'video' ? selectedFile : files.find((file) => file.type === 'video') || null,
    [files, selectedFile]
  );

  const sourceSegments = useMemo(
    () => timelineSegments.filter((segment) => segment.fileId === sourceVideo?.id),
    [timelineSegments, sourceVideo?.id]
  );

  const timelineWithOffsets = useMemo(() => {
    if (!sourceVideo) {
      return timelineSegments.map((segment) => {
        const duration = Math.max(0, segment.end - segment.start);
        const segmentFile = files.find((file) => file.id === segment.fileId);
        return { segment, file: segmentFile, startInTimeline: 0, duration };
      });
    }
    return sourceSegments.map((segment) => {
      const duration = Math.max(0, segment.end - segment.start);
      const segmentFile = files.find((file) => file.id === segment.fileId);
      return { segment, file: segmentFile, startInTimeline: segment.start, duration };
    });
  }, [timelineSegments, files, sourceVideo, sourceSegments]);

  const combinedDuration = Math.max(0, sourceVideo?.duration ?? selectedFile?.duration ?? 0);

  const [timelineTime, setTimelineTime] = useState(0);
  const [wasPlayingBeforeDrag, setWasPlayingBeforeDrag] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [segmentEdgeDrag, setSegmentEdgeDrag] = useState<{
    segmentId: string;
    edge: 'start' | 'end';
    initialStart: number;
    initialEnd: number;
  } | null>(null);
  const [segmentStartMark, setSegmentStartMark] = useState<number | null>(null);
  const [segmentEndMark, setSegmentEndMark] = useState<number | null>(null);
  const [renderedPreviewUrl, setRenderedPreviewUrl] = useState<string | null>(null);
  const [previewRenderStatus, setPreviewRenderStatus] = useState<'idle' | 'queued' | 'processing' | 'ready' | 'error'>('idle');
  const [previewRenderId, setPreviewRenderId] = useState<string | null>(null);
  const [draggedSegmentId, setDraggedSegmentId] = useState<string | null>(null);
  const [dragOverSegmentId, setDragOverSegmentId] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pendingSeekTimeRef = useRef<number | null>(null);
  const seekInProgressRef = useRef(false);
  const timelineTrackAreaRef = useRef<HTMLDivElement | null>(null);
  const previewRenderTimeoutRef = useRef<number | null>(null);
  const lastPreviewSignatureRef = useRef<string | null>(null);

  const timelineSignature = useMemo(
    () => timelineSegments.map((segment) => `${segment.fileId}:${segment.start}:${segment.end}:${segment.id}`).join('|'),
    [timelineSegments]
  );

  useEffect(() => {
    if (!sessionId || !timelineSegments.length) {
      if (previewRenderTimeoutRef.current) {
        window.clearTimeout(previewRenderTimeoutRef.current);
        previewRenderTimeoutRef.current = null;
      }
      setRenderedPreviewUrl(null);
      setPreviewRenderStatus('idle');
      setPreviewRenderId(null);
      lastPreviewSignatureRef.current = null;
      return;
    }

    const signature = timelineSignature;
    if (lastPreviewSignatureRef.current === signature) {
      return;
    }

    lastPreviewSignatureRef.current = signature;
    setRenderedPreviewUrl(null);
    setPreviewRenderStatus('idle');
    setPreviewRenderId(null);
  }, [sessionId, timelineSignature, timelineSegments]);

  const previewPlaybackFile = useMemo(() => {
    if (selectedFile?.type === 'video') {
      return selectedFile;
    }
    if (renderedPreviewUrl) {
      return {
        id: 'rendered-preview',
        name: 'Единый превью',
        type: 'video' as const,
        url: renderedPreviewUrl,
        size: 0,
        duration: combinedDuration,
        originalFileName: 'rendered-preview.mp4',
      };
    }

    if (timelineSegments.length > 0) {
      const firstVideoSegment = timelineSegments.find(s => s.type === 'video');
      if (firstVideoSegment) {
        return files.find(f => f.id === firstVideoSegment.fileId) || null;
      }
    }

    return null;
  }, [combinedDuration, renderedPreviewUrl, selectedFile, timelineSegments, files]);

  const previewFile = previewPlaybackFile;
  const combinedCurrentLabel = formatTime(timelineTime);

  const seekToTimelineTime = (newTime: number, playAfterSeek = false) => {
    const clampedTime = Math.max(0, Math.min(newTime, combinedDuration));
    setTimelineTime(clampedTime);

    if (!videoRef.current) return;

    const video = videoRef.current;
    seekInProgressRef.current = true;

    if (video.seeking) {
      pendingSeekTimeRef.current = clampedTime;
      return;
    }

    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      video.currentTime = clampedTime;
    } else {
      pendingSeekTimeRef.current = clampedTime;
    }

    if (playAfterSeek) {
      void video.play().catch((err) => console.error('[EditorPage] Play failed after seek:', err));
    }
  };

  useEffect(() => {
    if (timelineTime > combinedDuration) {
      setTimelineTime(combinedDuration);
    }
  }, [combinedDuration, timelineTime]);

  useEffect(() => {
    if (!timelineSegments.length) {
      setTimelineTime(0);
      setIsPlaying(false);
    }
  }, [timelineSegments.length]);

  const getTimelineTimeFromPointer = (clientX: number) => {
    const rect = timelineTrackAreaRef.current?.getBoundingClientRect();
    if (!rect || combinedDuration <= 0) return 0;
    const relativeX = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    return (relativeX / rect.width) * combinedDuration;
  };

  const handleTimelinePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingPlayhead(true);
    const currentlyPlaying = isPlaying;
    setWasPlayingBeforeDrag(currentlyPlaying);

    if (currentlyPlaying && videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
    }

    const nextTime = getTimelineTimeFromPointer(event.clientX);
    seekToTimelineTime(nextTime, false);
  };

  useEffect(() => {
    if (!isDraggingPlayhead) return;

    const handlePlayheadMove = (event: PointerEvent) => {
      const rect = timelineTrackAreaRef.current?.getBoundingClientRect();
      if (!rect) return;

      const relativeX = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
      const nextTime = (relativeX / rect.width) * combinedDuration;
      seekToTimelineTime(nextTime, false);
    };

    const handlePlayheadUp = () => {
      setIsDraggingPlayhead(false);
      if (wasPlayingBeforeDrag && videoRef.current) {
        void videoRef.current.play().catch(() => undefined);
        setIsPlaying(true);
      }
    };

    window.addEventListener('pointermove', handlePlayheadMove);
    window.addEventListener('pointerup', handlePlayheadUp);

    return () => {
      window.removeEventListener('pointermove', handlePlayheadMove);
      window.removeEventListener('pointerup', handlePlayheadUp);
    };
  }, [isDraggingPlayhead, combinedDuration, wasPlayingBeforeDrag]);

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    seekInProgressRef.current = true;

    const targetTime = pendingSeekTimeRef.current ?? timelineTime;

    if (targetTime > 0 && video.duration > 0) {
      video.currentTime = targetTime;
      pendingSeekTimeRef.current = null;
    }

    if (isPlaying) {
      void video.play().catch(() => undefined);
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;

    if (seekInProgressRef.current || isDraggingPlayhead || videoRef.current.seeking) {
      return;
    }

    setTimelineTime(videoRef.current.currentTime);
  };

  const handleSeeked = () => {
    if (!videoRef.current) return;

    if (pendingSeekTimeRef.current !== null) {
      const nextTime = pendingSeekTimeRef.current;
      pendingSeekTimeRef.current = null;
      videoRef.current.currentTime = nextTime;
    } else {
      seekInProgressRef.current = false;
      setTimelineTime(videoRef.current.currentTime);
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;

    if (videoRef.current.paused) {
      void videoRef.current.play().catch(() => undefined);
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleVolume = (value: number) => {
    if (!videoRef.current) return;
    videoRef.current.volume = value;
  };

  const handleRenderPreview = async () => {
    if (!sessionId || !timelineSegments.length) {
      setPreviewRenderStatus('error');
      return;
    }

    const renderId = `preview-${sessionId}-${Date.now()}`;
    const payload = {
      sessionId,
      renderId,
      segments: timelineSegments
        .filter((segment) => segment.fileKey)
        .map((segment) => ({
          fileKey: segment.fileKey,
          start: Math.max(0, Math.floor(segment.start)),
          end: Math.max(1, Math.ceil(segment.end)),
          type: segment.type,
        })),
    };

    setPreviewRenderId(renderId);
    setRenderedPreviewUrl(null);
    setPreviewRenderStatus('queued');

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/videos/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP status ${response.status}`);
      }

      setPreviewRenderStatus('processing');

      const pollStatus = async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/api/v1/videos/status/${renderId}`);
          if (!res.ok) throw new Error(`Status poll HTTP ${res.status}`);

          const json = await res.json();

          if (json.status === 'COMPLETED') {
            const url = `${API_BASE_URL}/api/v1/files/export/${sessionId}?t=${Date.now()}`;
            setRenderedPreviewUrl(url);
            setPreviewRenderStatus('ready');
            return;
          }

          if (json.status === 'FAILED') {
            setPreviewRenderStatus('error');
            return;
          }

          previewRenderTimeoutRef.current = window.setTimeout(() => {
            void pollStatus();
          }, 1500);
        } catch (pollErr) {
          setPreviewRenderStatus('error');
        }
      };

      previewRenderTimeoutRef.current = window.setTimeout(() => {
        void pollStatus();
      }, 1000);
    } catch (err) {
      setPreviewRenderStatus('error');
    }
  };

  const addSelectedFileToTimeline = () => {
    if (!selectedFile || !selectedFile.duration) return;
    addSegment({
      fileId: selectedFile.id,
      fileKey: selectedFile.fileKey,
      type: selectedFile.type,
      start: 0,
      end: selectedFile.duration,
    });
  };

  const setSegmentStart = () => {
    setSegmentStartMark(Math.round(timelineTime));
  };

  const setSegmentEnd = () => {
    setSegmentEndMark(Math.round(timelineTime));
  };

  const clearSegmentMarks = () => {
    setSegmentStartMark(null);
    setSegmentEndMark(null);
  };

  const addMarkedSegment = () => {
    const source = selectedFile?.type === 'video' ? selectedFile : sourceVideo;
    if (!source || segmentStartMark === null || segmentEndMark === null) return;
    const start = Math.min(segmentStartMark, segmentEndMark);
    const end = Math.max(segmentStartMark, segmentEndMark);
    if (end - start < 1) return;
    addSegment({
      fileId: source.id,
      fileKey: source.fileKey,
      type: source.type,
      start,
      end,
    });
    clearSegmentMarks();
  };

  const hasSelectionRange = segmentStartMark !== null && segmentEndMark !== null && combinedDuration > 0;
  const selectionRangeStart = hasSelectionRange ? Math.min(segmentStartMark!, segmentEndMark!) : 0;
  const selectionRangeEnd = hasSelectionRange ? Math.max(segmentStartMark!, segmentEndMark!) : 0;
  const selectionRangeWidth = hasSelectionRange
    ? ((selectionRangeEnd - selectionRangeStart) / combinedDuration) * 100
    : 0;

  const moveSegmentOrder = (segmentId: string, direction: number) => {
    const index = timelineSegments.findIndex((segment) => segment.id === segmentId);
    if (index === -1) return;
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= timelineSegments.length) return;
    const nextOrder = [...timelineSegments];
    [nextOrder[index], nextOrder[swapIndex]] = [nextOrder[swapIndex], nextOrder[index]];
    reorderSegments(nextOrder.map((segment) => segment.id));
  };

  const handleDragStart = (segmentId: string) => {
    setDraggedSegmentId(segmentId);
  };

  const handleDragEnd = () => {
    setDraggedSegmentId(null);
    setDragOverSegmentId(null);
  };

  const handleDragOver = (segmentId: string, event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragOverSegmentId(segmentId);
  };

  const handleDrop = (segmentId: string, event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!draggedSegmentId || draggedSegmentId === segmentId) return;
    const draggedIndex = timelineSegments.findIndex((segment) => segment.id === draggedSegmentId);
    const targetIndex = timelineSegments.findIndex((segment) => segment.id === segmentId);
    if (draggedIndex === -1 || targetIndex === -1) return;

    const nextOrder = [...timelineSegments];
    const [removed] = nextOrder.splice(draggedIndex, 1);
    nextOrder.splice(targetIndex, 0, removed);
    reorderSegments(nextOrder.map((segment) => segment.id));
    setDraggedSegmentId(null);
    setDragOverSegmentId(null);
  };

  const startSegmentEdgeDrag = (segmentId: string, edge: 'start' | 'end', event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const segment = timelineSegments.find((segment) => segment.id === segmentId);
    if (!segment) return;
    setSegmentEdgeDrag({
      segmentId,
      edge,
      initialStart: segment.start,
      initialEnd: segment.end,
    });
  };

  const stopSegmentEdgeDrag = () => {
    setSegmentEdgeDrag(null);
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (!segmentEdgeDrag || !timelineTrackAreaRef.current) return;
    const timelineRect = timelineTrackAreaRef.current.getBoundingClientRect();
    const positionRatio = Math.max(0, Math.min(1, (event.clientX - timelineRect.left) / timelineRect.width));
    const newTime = positionRatio * combinedDuration;

    if (segmentEdgeDrag.edge === 'start') {
      const nextStart = Math.min(newTime, segmentEdgeDrag.initialEnd - 1);
      updateSegment(segmentEdgeDrag.segmentId, {
        start: Math.max(0, Math.floor(nextStart)),
      });
    } else {
      const nextEnd = Math.max(newTime, segmentEdgeDrag.initialStart + 1);
      updateSegment(segmentEdgeDrag.segmentId, {
        end: Math.min(combinedDuration, Math.ceil(nextEnd)),
      });
    }
  };

  useEffect(() => {
    if (videoRef.current && previewFile?.url) {
      const video = videoRef.current;
      seekInProgressRef.current = true;
      
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        video.currentTime = timelineTime;
      } else {
        pendingSeekTimeRef.current = timelineTime;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewFile?.url]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const key = event.key.toLowerCase();
      if (key === 's') {
        setSegmentStart();
      }
      if (key === 'e') {
        setSegmentEnd();
      }
      if (key === 'a' || event.key === '+') {
        addMarkedSegment();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [timelineTime, selectedFile, segmentStartMark, segmentEndMark, addMarkedSegment]);

  useEffect(() => {
    if (!segmentEdgeDrag) return;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopSegmentEdgeDrag);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopSegmentEdgeDrag);
    };
  }, [segmentEdgeDrag, handlePointerMove]);

  return (
    <div className="page editor-page">
      <aside className="editor-sidebar">
        <button className="sidebar-button" title="Текст">
          <img src="/type.png" alt="Текст" />
          <span>Текст</span>
        </button>
      </aside>

      <div className="editor-grid">
        <section className="media-panel">
          <div className="panel-header">Медиатека</div>
          <div className="media-list">
            {files.length === 0 ? (
              <div className="empty-state">Загрузите video или audio на странице Импорт.</div>
            ) : (
              files.map((file) => (
                <div key={file.id} className={`media-item ${file.id === selectedFileId ? 'selected' : ''}`}>
                  <button className="media-item-button" onClick={() => selectFile(file.id)}>
                    <div className="media-preview-icon">{file.type === 'video' ? '🎬' : '🎵'}</div>
                    <div>
                      <strong>{file.name}</strong>
                      <div className="media-subtitle">{file.type.toUpperCase()}</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="secondary-button small-button"
                    onClick={addSelectedFileToTimeline}
                    disabled={!file.duration}
                  >
                    Добавить на таймлайн
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="preview-panel">
          <div className="preview-card">
            {previewFile ? (
              previewFile.type === 'video' ? (
                <>
                  {previewRenderStatus === 'error' && (
                    <div className="empty-state">Не удалось собрать preview</div>
                  )}
                  <video
                    ref={videoRef}
                    src={previewFile?.url || undefined}
                    className="preview-video"
                    onLoadedMetadata={handleLoadedMetadata}
                    onTimeUpdate={handleTimeUpdate}
                    onEnded={() => setIsPlaying(false)}
                    onSeeked={handleSeeked}
                    preload="auto"
                  />
                  <div className="preview-controls-bar">
                    <div className="preview-time-pill">
                      <span className="current-label">{combinedCurrentLabel}</span>
                      <span>/</span>
                      <span>{formatTime(combinedDuration)}</span>
                    </div>
                    <button type="button" className="video-button main-button" onClick={togglePlay}>
                      {isPlaying ? '⏸' : '▶'}
                    </button>
                    <div className="volume-group">
                      <button type="button" className="video-button icon-button">🔊</button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        defaultValue={1}
                        onChange={(event) => handleVolume(Number(event.target.value))}
                        className="video-slider volume-slider"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="audio-preview-card">
                  <div className="audio-preview-label">Аудио дорожка</div>
                  <audio controls src={previewFile.url} className="audio-player" />
                </div>
              )
            ) : (
              <div className="empty-state">Выберите файл или сегмент для предварительного просмотра</div>
            )}
          </div>
        </section>

        <section className="properties-panel">
          <div className="panel-header">Свойства сегмента</div>
          <div className="property-group">
            <div className="field-label">Добавление на таймлайн</div>
            <button
              type="button"
              className="primary-button full-width"
              onClick={addSelectedFileToTimeline}
              disabled={!selectedFile || !selectedFile.duration}
            >
              Добавить выбранный файл
            </button>
          </div>

          {selectedSegment ? (
            <>
              <div className="property-group">
                <div className="field-label">Файл сегмента</div>
                <div>{selectedSegmentFile?.name || '—'}</div>
              </div>
              <div className="property-group">
                <div className="field-label">С начала</div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, (selectedSegmentFile?.duration || 1) - 1)}
                  value={selectedSegment.start}
                  onChange={(event) => {
                    const newStart = Number(event.target.value);
                    updateSegment(selectedSegment.id, {
                      start: newStart,
                      end: Math.max(newStart + 1, selectedSegment.end),
                    });
                  }}
                  className="range-slider"
                />
                <div className="slider-values">
                  <span>{formatTime(selectedSegment.start)}</span>
                  <span>{formatTime(selectedSegment.end)}</span>
                </div>
              </div>
              <div className="property-group">
                <div className="field-label">До</div>
                <input
                  type="range"
                  min={selectedSegment.start + 1}
                  max={selectedSegmentFile?.duration || selectedSegment.end}
                  value={selectedSegment.end}
                  onChange={(event) => {
                    const newEnd = Number(event.target.value);
                    updateSegment(selectedSegment.id, {
                      end: Math.max(selectedSegment.start + 1, newEnd),
                    });
                  }}
                  className="range-slider"
                />
                <div className="slider-values">
                  <span>{formatTime(selectedSegment.start)}</span>
                  <span>{formatTime(selectedSegment.end)}</span>
                </div>
              </div>
              <div className="property-group">
                <div className="field-label">Длительность сегмента</div>
                <div>{formatTime(selectedSegment.end - selectedSegment.start)}</div>
              </div>
            </>
          ) : (
            <div className="empty-state">Выберите сегмент в таймлайне, чтобы обрезать его.</div>
          )}
        </section>

        <div className="timeline-card full-width">
          <div className="timeline-toolbar">
            <div className="toolbar-left">
              <button type="button" className="video-button small-button" onClick={setSegmentStart} disabled={combinedDuration === 0}>
                Установить старт S
              </button>
              <button type="button" className="video-button small-button" onClick={setSegmentEnd} disabled={combinedDuration === 0}>
                Установить конец E
              </button>
              <button type="button" className="primary-button small-button" onClick={addMarkedSegment} disabled={segmentStartMark === null || segmentEndMark === null}>
                Добавить сегмент
              </button>
              <button type="button" className="secondary-button small-button" onClick={clearSegmentMarks} disabled={segmentStartMark === null && segmentEndMark === null}>
                Сбросить метки
              </button>
            </div>
            <div className="marker-info">
              {segmentStartMark !== null && <span>Start: {formatTime(segmentStartMark)}</span>}
              {segmentEndMark !== null && <span>End: {formatTime(segmentEndMark)}</span>}
              {segmentStartMark === null && segmentEndMark === null && <span>Нажмите S / E, чтобы отметить диапазон</span>}
            </div>
            <div className="toolbar-right">
              <button type="button" className="primary-button small-button" onClick={handleRenderPreview} disabled={!timelineSegments.length}>
                Render preview
              </button>
              <span className={`preview-status-pill ${previewRenderStatus}`}>
                {previewRenderStatus === 'idle' && 'Idle'}
                {previewRenderStatus === 'queued' && 'Queued'}
                {previewRenderStatus === 'processing' && 'Processing'}
                {previewRenderStatus === 'ready' && 'Ready'}
                {previewRenderStatus === 'error' && 'Error'}
              </span>
            </div>
          </div>

          {timelineSegments.length === 0 ? (
            <div className="empty-state">Добавьте видео на таймлайн, чтобы собрать монтаж.</div>
          ) : (
            <div className="timeline-wrapper">
              <div className="timeline-ruler" aria-hidden>
                {Array.from({ length: Math.max(1, Math.ceil(combinedDuration)) + 1 }).map((_, i) => {
                  const denom = Math.max(1, combinedDuration);
                  return (
                    <div key={i} className="ruler-tick" style={{ left: `${(i / denom) * 100}%` }}>
                      <span className="ruler-label">{i}s</span>
                    </div>
                  );
                })}
              </div>

              <div className="timeline-tracks" ref={timelineTrackAreaRef} onPointerDown={handleTimelinePointerDown}>
                <div className="track-row video-track">
                  <div className="track-label">Видео</div>
                  <div className="track-area">

                    {hasSelectionRange && (
                      <div
                        className="selection-range"
                        style={{
                          left: `${(selectionRangeStart / combinedDuration) * 100}%`,
                          width: `${selectionRangeWidth}%`,
                        }}
                      />
                    )}
                    {segmentStartMark !== null && (
                      <div
                        className="segment-marker segment-start-marker"
                        style={{ left: `${(segmentStartMark / combinedDuration) * 100}%` }}
                      />
                    )}
                    {segmentEndMark !== null && (
                      <div
                        className="segment-marker segment-end-marker"
                        style={{ left: `${(segmentEndMark / combinedDuration) * 100}%` }}
                      />
                    )}

                    <div className="track-inner">
                      {timelineWithOffsets
                        .filter((entry) => entry.file?.type === 'video')
                        .map((entry) => {
                          const denom = Math.max(1, combinedDuration);
                          const left = (entry.startInTimeline / denom) * 100;
                          const width = (entry.duration / denom) * 100;
                          const isSelected = entry.segment.id === selectedSegmentId;
                          return (
                            <div
                              key={entry.segment.id}
                              className={`track-segment ${isSelected ? 'selected' : ''}`}
                              style={{ left: `${left}%`, width: `${width}%` }}
                              onClick={() => selectSegment(entry.segment.id)}
                            >
                              <div
                                role="button"
                                className={`segment-handle start-handle ${isSelected ? 'active' : ''}`}
                                onPointerDown={(event) => startSegmentEdgeDrag(entry.segment.id, 'start', event)}
                                onClick={(event) => event.stopPropagation()}
                              />
                              <div className="seg-title">{entry.file?.name}</div>
                              <div
                                role="button"
                                className={`segment-handle end-handle ${isSelected ? 'active' : ''}`}
                                onPointerDown={(event) => startSegmentEdgeDrag(entry.segment.id, 'end', event)}
                                onClick={(event) => event.stopPropagation()}
                              />
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>

                <div className="track-row audio-track">
                  <div className="track-label">Аудио</div>
                  <div className="track-area">
                    <div className="track-inner">
                      {timelineWithOffsets
                        .filter((entry) => entry.file?.type === 'audio')
                        .map((entry) => {
                          const denom = Math.max(1, combinedDuration);
                          const left = (entry.startInTimeline / denom) * 100;
                          const width = (entry.duration / denom) * 100;
                          const isSelected = entry.segment.id === selectedSegmentId;
                          return (
                            <div
                              key={entry.segment.id}
                              className={`track-segment audio ${isSelected ? 'selected' : ''}`}
                              style={{ left: `${left}%`, width: `${width}%` }}
                              onClick={() => selectSegment(entry.segment.id)}
                            >
                              <div
                                role="button"
                                className={`segment-handle start-handle ${isSelected ? 'active' : ''}`}
                                onPointerDown={(event) => startSegmentEdgeDrag(entry.segment.id, 'start', event)}
                                onClick={(event) => event.stopPropagation()}
                              />
                              <div className="seg-title">{entry.file?.name}</div>
                              <div
                                role="button"
                                className={`segment-handle end-handle ${isSelected ? 'active' : ''}`}
                                onPointerDown={(event) => startSegmentEdgeDrag(entry.segment.id, 'end', event)}
                                onClick={(event) => event.stopPropagation()}
                              />
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>

                <div className="playhead" style={{ left: combinedDuration ? `${(timelineTime / combinedDuration) * 100}%` : '0%' }} />
              </div>

              {timelineSegments.length > 0 && (
                <div className="segment-list">
                  <div className="segment-list-header">Список сегментов</div>
                  <div className="segment-list-items">
                    {timelineSegments.map((segment, index) => {
                      const file = files.find((item) => item.id === segment.fileId);
                      return (
                        <button
                          key={segment.id}
                          type="button"
                          className={`segment-list-item ${selectedSegmentId === segment.id ? 'selected' : ''} ${dragOverSegmentId === segment.id ? 'drag-over' : ''}`}
                          onClick={() => {
                            // 1. Выбираем сам сегмент
                            selectSegment(segment.id);
                            
                            // 2. ИСПРАВЛЕНИЕ: Переключаем активный файл на тот, к которому относится сегмент
                            selectFile(segment.fileId);
                            
                            // 3. (Опционально) Перематываем плеер на начало сегмента
                            const videoElement = document.querySelector('video');
                            if (videoElement) {
                              videoElement.currentTime = segment.start;
                            }
                          }}
                          draggable
                          onDragStart={() => handleDragStart(segment.id)}
                          onDragEnd={handleDragEnd}
                          onDragOver={(event) => handleDragOver(segment.id, event)}
                          onDrop={(event) => handleDrop(segment.id, event)}
                        >
                          <div className="segment-list-title">
                            {file?.name || segment.fileId} • {formatTime(segment.start)} - {formatTime(segment.end)}
                          </div>
                          <div className="segment-list-actions">
                            <button
                              type="button"
                              className="small-button"
                              onClick={(event) => {
                                event.stopPropagation();
                                moveSegmentOrder(segment.id, -1);
                              }}
                              disabled={index === 0}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="small-button"
                              onClick={(event) => {
                                event.stopPropagation();
                                moveSegmentOrder(segment.id, 1);
                              }}
                              disabled={index === timelineSegments.length - 1}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              className="secondary-button small-button"
                              onClick={(event) => {
                                event.stopPropagation();
                                removeSegment(segment.id);
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default EditorPage;