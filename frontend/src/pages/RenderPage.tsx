import { useMemo, useState } from 'react';
import { useSession } from '../context/SessionContext';
import { API_BASE_URL } from '../api';

const qualityLevels = ['Стандартное', 'Высокое'];
const fpsOptions = ['24', '30', '60'];
const formatOptions = ['MP4', 'MOV', 'AVI'];

function RenderPage() {
  const { files, sessionId, timelineSegments } = useSession();
  const [quality, setQuality] = useState('Высокое');
  const [fps, setFps] = useState('30');
  const [format, setFormat] = useState('MP4');
  const [bitrate, setBitrate] = useState(35);

  const firstSegment = timelineSegments[0];
  const selectedTimelineFile = useMemo(
    () => (firstSegment ? files.find((file) => file.id === firstSegment.fileId) : null),
    [files, firstSegment]
  );
  const selectedVideo = selectedTimelineFile || files.find((file) => file.type === 'video');
  const duration = timelineSegments.length
    ? timelineSegments.reduce((sum, segment) => sum + Math.max(0, segment.end - segment.start), 0)
    : selectedVideo ? selectedVideo.duration || 0 : 0;

  const startProcessing = async () => {
    if (!sessionId) return;
    const segments = timelineSegments
      .filter((segment) => segment.fileKey)
      .map((segment) => ({
        fileKey: segment.fileKey,
        start: Math.max(0, Math.floor(segment.start)),
        end: Math.max(1, Math.ceil(segment.end)),
      }));
    if (segments.length === 0) return;

    const renderId = 'r' + Math.random().toString(36).slice(2, 10);

    const payload = {
      sessionId,
      renderId,
      segments,
    };

    try {
      await fetch(`${API_BASE_URL}/api/v1/videos/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      alert('Задача отправлена на рендер: ' + renderId);
    } catch (e) {
      console.error(e);
      alert('Не удалось отправить задачу на рендер');
    }
  };

  return (
    <div className="page render-page">
      <div className="page-header">
        <div>
          <h1>Настройки экспорта</h1>
          <p>Выберите параметры для финального рендера вашего видео.</p>
        </div>
        <div className="session-badge">Session: {sessionId}</div>
      </div>

      <div className="render-layout">
        <section className="render-preview-card">
          <div className="panel-header">Предпросмотр</div>
          {selectedVideo ? (
            <video src={selectedVideo.url} controls className="preview-video" />
          ) : (
            <div className="empty-state">Загрузите видео на странице Upload, чтобы увидеть превью.</div>
          )}
          <div className="render-summary">
            <div>
              <div className="small-label">Название проекта</div>
              <div className="summary-value">{selectedVideo?.name || 'Untitled_Project'}</div>
            </div>
            <div>
              <div className="small-label">Длительность</div>
              <div className="summary-value">{duration ? `${Math.floor(duration / 3600)}:${String(Math.floor((duration % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(duration % 60)).padStart(2, '0')}` : '00:00:00'}</div>
            </div>
          </div>
        </section>

        <section className="render-controls-card">
          <div className="panel-header">Параметры рендера</div>
          <div className="field-block">
            <div className="field-title">Разрешение</div>
            <div className="option-grid">
              {['720p', '1080p'].map((option) => (
                <button
                  key={option}
                  className={`pill-button ${option === '1080p' ? 'active' : ''}`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="field-block">
            <div className="field-title">Частота кадров (FPS)</div>
            <div className="option-grid">
              {fpsOptions.map((option) => (
                <button
                  key={option}
                  className={`pill-button ${option === fps ? 'active' : ''}`}
                  onClick={() => setFps(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="field-block">
            <div className="field-title">Формат файла</div>
            <div className="option-grid">
              {formatOptions.map((option) => (
                <button
                  key={option}
                  className={`pill-button ${option === format ? 'active' : ''}`}
                  onClick={() => setFormat(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="field-block">
            <div className="field-title">Качество (битрейт)</div>
            <div className="bitrate-row">
              <div className="subtext">Минимальное</div>
              <div className="subtext">Максимальное</div>
            </div>
            <input
              type="range"
              min={10}
              max={80}
              value={bitrate}
              onChange={(event) => setBitrate(Number(event.target.value))}
              className="range-slider"
            />
            <div className="bitrate-value">Высокое ({bitrate} Mbps)</div>
          </div>

          <div className="estimate-row">
            <div>
              <div className="small-label">Оценочный размер</div>
              <div className="summary-value">1.42 ГБ</div>
            </div>
            <div>
              <div className="small-label">Время рендера</div>
              <div className="summary-value">~ 04:20</div>
            </div>
          </div>

          <button className="primary-button full-width" onClick={startProcessing}>Начать обработку</button>
        </section>
      </div>
    </div>
  );
}

export default RenderPage;
