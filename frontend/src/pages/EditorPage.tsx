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

  const combinedDuration = timelineWithOffsets.length
    ? timelineWithOffsets[timelineWithOffsets.length - 1].startInTimeline + timelineWithOffsets[timelineWithOffsets.length - 1].duration
    : selectedFile?.duration ?? 0;

  const [timelineTime, setTimelineTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [draggedSegmentId, setDraggedSegmentId] = useState<string | null>(null);
  const [dragOverSegmentId, setDragOverSegmentId] = useState<string | null>(null);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [renderedPreviewUrl, setRenderedPreviewUrl] = useState<string | null>(null);
  const [previewRenderStatus, setPreviewRenderStatus] = useState<'idle' | 'rendering' | 'ready' | 'error'>('idle');
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
      lastPreviewSignatureRef.current = null;
      return;
    }

    const signature = timelineSignature;
    if (lastPreviewSignatureRef.current === signature) {
      return;
    }

    lastPreviewSignatureRef.current = signature;
    setPreviewRenderStatus('rendering');

    let isCancelled = false;

    const buildPreviewVideo = async () => {
      const payload = {
        sessionId,
        renderId: `preview-${sessionId}-${Date.now()}`,
        segments: timelineSegments
          .filter((segment) => segment.fileKey)
          .map((segment) => ({
            fileKey: segment.fileKey,
            start: Math.max(0, Math.floor(segment.start)),
            end: Math.max(1, Math.ceil(segment.end)),
          })),
      };

      try {
        await fetch(`${API_BASE_URL}/api/v1/videos/render`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (error) {
        if (!isCancelled) {
          setPreviewRenderStatus('error');
        }
        return;
      }

      const pollStatus = async () => {
        if (isCancelled) return;
        try {
          const res = await fetch(`${API_BASE_URL}/api/v1/videos/status/${payload.renderId}`);
          if (!res.ok) {
            throw new Error('status fetch failed');
          }

          const json = await res.json();
          if (json.status === 'COMPLETED') {
            if (!isCancelled) {
              setRenderedPreviewUrl(`${API_BASE_URL}/api/v1/files/export/${sessionId}?t=${Date.now()}`);
              setPreviewRenderStatus('ready');
            }
            return;
          }

          if (json.status === 'FAILED') {
            if (!isCancelled) {
              setPreviewRenderStatus('error');
            }
            return;
          }

          previewRenderTimeoutRef.current = window.setTimeout(() => {
            void pollStatus();
          }, 1500);
        } catch (error) {
          if (!isCancelled) {
            setPreviewRenderStatus('error');
          }
        }
      };

      previewRenderTimeoutRef.current = window.setTimeout(() => {
        void pollStatus();
      }, 1000);
    };

    void buildPreviewVideo();

    return () => {
      isCancelled = true;
      if (previewRenderTimeoutRef.current) {
        window.clearTimeout(previewRenderTimeoutRef.current);
        previewRenderTimeoutRef.current = null;
      }
    };
  }, [sessionId, timelineSignature, timelineSegments]);

  const resolveTimelineToMediaTime = (time: number) => {
    if (!timelineWithOffsets.length) {
      return {
        entry: null as typeof timelineWithOffsets[number] | null,
        mediaTime: Math.max(0, time),
        sourceUrl: selectedFile?.url ?? '',
      };
    }

    const entry =
      timelineWithOffsets.find((item) => time < item.startInTimeline + item.duration) ||
      timelineWithOffsets[timelineWithOffsets.length - 1];
    const offsetInSegment = Math.max(0, Math.min(entry.duration, time - entry.startInTimeline));

    return {
      entry,
      mediaTime: entry.segment.start + offsetInSegment,
      sourceUrl: entry.file?.url || '',
    };
  };

  const resolvedTimelinePosition = useMemo(() => resolveTimelineToMediaTime(timelineTime), [timelineTime, timelineWithOffsets, selectedFile]);
  const activeTimelineEntry = resolvedTimelinePosition.entry;

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

    if (timelineSegments.length > 0 && previewRenderStatus === 'rendering') {
      return selectedFile?.type === 'video' ? selectedFile : null;
    }

    if (timelineSegments.length > 0) {
      return null;
    }

    return selectedFile?.type === 'video' ? selectedFile : null;
  }, [combinedDuration, previewRenderStatus, renderedPreviewUrl, selectedFile, timelineSegments.length]);

  const previewFile = previewPlaybackFile;
  const previewSegmentStart = activeTimelineEntry?.segment.start ?? 0;
  const previewSegmentDuration = activeTimelineEntry?.duration ?? 0;
  const previewSegmentPosition = activeTimelineEntry
    ? Math.max(0, Math.min(previewSegmentDuration, timelineTime - activeTimelineEntry.startInTimeline))
    : timelineTime;
  const previewFileTime = renderedPreviewUrl ? timelineTime : resolvedTimelinePosition.mediaTime;
  const combinedCurrentLabel = formatTime(timelineTime);
  const useRenderedPreview = Boolean(renderedPreviewUrl);

  const seekToTimelineTime = (newTime: number, playAfterSeek = false) => {
    const clampedTime = Math.max(0, Math.min(newTime, combinedDuration));
    setTimelineTime(clampedTime);

    if (!videoRef.current) return;

    if (useRenderedPreview && renderedPreviewUrl) {
      pendingSeekTimeRef.current = clampedTime;
      seekInProgressRef.current = true;
      videoRef.current.src = renderedPreviewUrl;
      videoRef.current.currentTime = clampedTime;
      videoRef.current.load();
      if (playAfterSeek) {
        void videoRef.current.play().catch(() => undefined);
      }
      return;
    }

    const targetState = resolveTimelineToMediaTime(clampedTime);
    const targetFileTime = targetState.mediaTime;
    const targetSrc = targetState.sourceUrl;
    const currentSrc = videoRef.current.currentSrc || videoRef.current.src;
    const normalizedTargetSrc = targetSrc ? new URL(targetSrc, window.location.href).href : '';
    const sameSource = currentSrc === normalizedTargetSrc;

    pendingSeekTimeRef.current = targetFileTime;
    seekInProgressRef.current = true;
    if (sameSource && videoRef.current.readyState > 0) {
      videoRef.current.currentTime = targetFileTime;
      pendingSeekTimeRef.current = null;
      seekInProgressRef.current = false;
    } else {
      videoRef.current.src = targetSrc;
      videoRef.current.load();
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
    const seekTime = pendingSeekTimeRef.current ?? previewFileTime;
    if (seekTime !== null) {
      videoRef.current.currentTime = seekTime;
      pendingSeekTimeRef.current = null;
      seekInProgressRef.current = false;
    } else if (Math.abs(previewFileTime - videoRef.current.currentTime) > 0.1) {
      videoRef.current.currentTime = previewFileTime;
    }
    if (isPlaying) {
      void videoRef.current.play().catch(() => undefined);
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    if (seekInProgressRef.current) return;

    if (useRenderedPreview) {
      setTimelineTime(videoRef.current.currentTime);
      if (videoRef.current.ended) {
        setIsPlaying(false);
      }
      return;
    }

    if (!activeTimelineEntry) return;

    const videoCurrent = videoRef.current.currentTime;
    const elapsed = Math.max(0, videoCurrent - previewSegmentStart);
    const nextCombined = activeTimelineEntry.startInTimeline + Math.min(previewSegmentDuration, elapsed);
    setTimelineTime(nextCombined);

    if (elapsed >= previewSegmentDuration - 0.05) {
      const nextIndex = timelineWithOffsets.indexOf(activeTimelineEntry) + 1;
      if (nextIndex < timelineWithOffsets.length) {
        const nextEntry = timelineWithOffsets[nextIndex];
        setTimelineTime(nextEntry.startInTimeline);
        if (!videoRef.current) return;
        pendingSeekTimeRef.current = nextEntry.segment.start;
        seekInProgressRef.current = true;
        videoRef.current.src = nextEntry.file?.url || '';
        videoRef.current.load();
        if (isPlaying) {
          void videoRef.current.play().catch(() => undefined);
        }
      } else {
        setIsPlaying(false);
      }
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = (value: number) => {
    seekToTimelineTime(value, false);
  };

  const handleVolume = (value: number) => {
    if (!videoRef.current) return;
    videoRef.current.volume = value;
    setVolume(value);
  };

  const handleFullScreen = () => {
    if (!videoRef.current) return;
    if (videoRef.current.requestFullscreen) {
      videoRef.current.requestFullscreen();
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
        <button className="sidebar-button">Текст</button>
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
                  {previewRenderStatus === 'rendering' && (
                    <div className="empty-state">Собираем единое видео из таймлайна…</div>
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
                  <div className="preview-controls-panel">
                    <div className="controls-left">
                      <span className="time-label">{combinedCurrentLabel}</span>
                      <input
                        type="range"
                        min={0}
                        max={combinedDuration || 0}
                        value={timelineTime}
                        step={0.1}
                        onChange={(event) => handleSeek(Number(event.target.value))}
                        className="video-slider progress-slider"
                      />
                      <span className="time-label">{formatTime(combinedDuration)}</span>
                    </div>
                    <div className="controls-center">
                      <button type="button" className="video-button main-button" onClick={togglePlay}>
                        {isPlaying ? '⏸' : '▶'}
                      </button>
                    </div>
                    <div className="controls-right">
                      <div className="volume-group">
                        <button type="button" className="video-button icon-button">🔊</button>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={volume}
                          onChange={(event) => handleVolume(Number(event.target.value))}
                          className="video-slider volume-slider"
                        />
                      </div>
                      <button type="button" className="video-button icon-button" onClick={handleFullScreen}>
                        ⛶
                      </button>
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
              <div className="empty-state">Выберите файл или сегмент для предварительного просмотра.</div>
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
