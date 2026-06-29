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
    removeFile,
  } = useSession();

  const selectedFile = useMemo(() => files.find((file) => file.id === selectedFileId), [files, selectedFileId]);
  const selectedSegment = useMemo(
    () => timelineSegments.find((segment) => segment.id === selectedSegmentId),
    [timelineSegments, selectedSegmentId]
  );
  const selectedSegmentFile = selectedSegment ? files.find((file) => file.id === selectedSegment.fileId) : undefined;

  const timelineWithOffsets = useMemo(() => {
    let offset = 0;
    return timelineSegments.map((segment) => {
      const duration = Math.max(0, segment.end - segment.start);
      const segmentFile = files.find((file) => file.id === segment.fileId);
      const result = { segment, file: segmentFile, startInTimeline: offset, duration };
      offset += duration;
      return result;
    });
  }, [timelineSegments, files]);

  const combinedDuration = Math.max(
    0,
    timelineWithOffsets.length
      ? timelineWithOffsets[timelineWithOffsets.length - 1].startInTimeline + timelineWithOffsets[timelineWithOffsets.length - 1].duration
      : selectedFile?.duration ?? 0
  );

  const [timelineTime, setTimelineTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [draggedSegmentId, setDraggedSegmentId] = useState<string | null>(null);
  const [dragOverSegmentId, setDragOverSegmentId] = useState<string | null>(null);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [renderedPreviewUrl, setRenderedPreviewUrl] = useState<string | null>(null);
  const [previewRenderStatus, setPreviewRenderStatus] = useState<'idle' | 'queued' | 'processing' | 'ready' | 'error'>('idle');
  const [previewRenderId, setPreviewRenderId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pendingSeekTimeRef = useRef<number | null>(null);
  const seekInProgressRef = useRef(false);
  const timelineTracksRef = useRef<HTMLDivElement | null>(null);
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

    if (timelineSegments.length === 0) {
      return selectedFile?.type === 'video' ? selectedFile : null;
    }

    return null;
  }, [combinedDuration, renderedPreviewUrl, selectedFile, timelineSegments.length]);

  const previewFile = previewPlaybackFile;
  const combinedCurrentLabel = formatTime(timelineTime);
  const useRenderedPreview = Boolean(renderedPreviewUrl);

  const seekToTimelineTime = (newTime: number, playAfterSeek = false) => {
    const clampedTime = Math.max(0, Math.min(newTime, combinedDuration));
    setTimelineTime(clampedTime);

    if (!videoRef.current) return;

    // Если видео уже готово к воспроизведению, сразу меняем время
    if (videoRef.current.readyState > 0) {
      videoRef.current.currentTime = clampedTime;
    } else {
      // Если видео (или новый src) еще грузится, откладываем перемотку
      pendingSeekTimeRef.current = clampedTime;
    }
    
    if (playAfterSeek) {
      void videoRef.current.play().catch(() => undefined);
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

  useEffect(() => {
    if (!isDraggingPlayhead) return;

    const handlePointerMove = (event: PointerEvent) => {
      const rect = timelineTracksRef.current?.getBoundingClientRect();
      if (!rect) return;

      const labelOffset = 72;
      const usableWidth = Math.max(0, rect.width - labelOffset);
      const relativeX = Math.min(Math.max(event.clientX - rect.left - labelOffset, 0), usableWidth);
      const nextTime = (relativeX / usableWidth) * combinedDuration;
      seekToTimelineTime(nextTime, isPlaying);
    };

    const handlePointerUp = () => {
      setIsDraggingPlayhead(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDraggingPlayhead, combinedDuration, isPlaying]);

  const handleTimelinePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingPlayhead(true);

    const rect = timelineTracksRef.current?.getBoundingClientRect();
    if (!rect) return;

    const labelOffset = 72;
    const usableWidth = Math.max(0, rect.width - labelOffset);
    const relativeX = Math.min(Math.max(event.clientX - rect.left - labelOffset, 0), usableWidth);
    const nextTime = (relativeX / usableWidth) * combinedDuration;
    seekToTimelineTime(nextTime, isPlaying);
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    
    // Применяем время, которое пользователь успел накликать, пока видео грузилось
    if (pendingSeekTimeRef.current !== null) {
      videoRef.current.currentTime = pendingSeekTimeRef.current;
      pendingSeekTimeRef.current = null;
    }
    
    if (isPlaying) {
      void videoRef.current.play().catch(() => undefined);
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    
    // КРИТИЧНО: Игнорируем апдейты времени от плеера, если мы в процессе перетаскивания
    // или если видео программно перематывается
    if (seekInProgressRef.current || isDraggingPlayhead) return;

    setTimelineTime(videoRef.current.currentTime);
    if (videoRef.current.ended) {
      setIsPlaying(false);
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
        throw new Error('render request failed');
      }

      setPreviewRenderStatus('processing');

      const pollStatus = async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/api/v1/videos/status/${renderId}`);
          if (!res.ok) {
            throw new Error('status fetch failed');
          }

          const json = await res.json();
          if (json.status === 'COMPLETED') {
            setRenderedPreviewUrl(`${API_BASE_URL}/api/v1/files/export/${sessionId}?t=${Date.now()}`);
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
        } catch {
          setPreviewRenderStatus('error');
        }
      };

      previewRenderTimeoutRef.current = window.setTimeout(() => {
        void pollStatus();
      }, 1000);
    } catch {
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

  const timelineTotal = Math.max(
    1,
    ...timelineSegments.map((segment) => Math.max(1, segment.end - segment.start))
  );

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
              <div className="empty-state">Загрузите видео или аудио на странице Импорт.</div>
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
                    key={previewFile?.url}
                    ref={videoRef}
                    src={previewFile?.url}
                    className="preview-video"
                    onLoadedMetadata={handleLoadedMetadata}
                    onTimeUpdate={handleTimeUpdate}
                    onEnded={() => setIsPlaying(false)}
                  />
                  <div className="preview-controls-bar">
                    <div className="preview-time-pill">
                      <span className='current-label'>{combinedCurrentLabel}</span>
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

          {/* timeline-card moved to span full editor-grid (see below) */}
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

        {/* timeline-card spanning full width of editor-grid */}
        <div className="timeline-card full-width">
          <div className="timeline-toolbar">
            <div className="toolbar-left">
              <button type="button" className="video-button small-button">Разрезать</button>
              <button type="button" className="video-button small-button">Удалить</button>
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

              <div className="timeline-tracks" ref={timelineTracksRef} onPointerDown={handleTimelinePointerDown}>
                <div className="track-row video-track">
                  <div className="track-label">Видео</div>
                  <div className="track-area">
                    <div className="track-inner">
                      {timelineWithOffsets
                        .filter((entry) => entry.file?.type === 'video')
                        .map((entry) => {
                          const denom = Math.max(1, combinedDuration);
                          const left = (entry.startInTimeline / denom) * 100;
                          const width = (entry.duration / denom) * 100;
                          return (
                            <div
                              key={entry.segment.id}
                              className="track-segment"
                              style={{ left: `${left}%`, width: `${width}%` }}
                              onClick={() => selectSegment(entry.segment.id)}
                            >
                              <div className="seg-title">{entry.file?.name}</div>
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
                          return (
                            <div key={entry.segment.id} className="track-segment audio" style={{ left: `${left}%`, width: `${width}%` }}>
                              <div className="seg-title">{entry.file?.name}</div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>

                <div className="playhead" style={{ left: combinedDuration ? `${(timelineTime / combinedDuration) * 100}%` : '0%' }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default EditorPage;
