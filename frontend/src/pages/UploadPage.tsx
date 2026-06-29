import { useCallback, useRef } from 'react';
import { useSession } from '../context/SessionContext';

const acceptedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'audio/mpeg', 'audio/wav'];

function UploadPage() {
  const { sessionId, files, addFiles, removeFile } = useSession();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList) return;
      const items = Array.from(fileList).filter((file) => acceptedTypes.includes(file.type));
      if (items.length) {
        await addFiles(items);
      }
    },
    [addFiles]
  );

  const onDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      await handleFiles(event.dataTransfer.files);
    },
    [handleFiles]
  );

  return (
    <div className="page upload-page">
      <div className="page-header">
        <div>
          <h1>Импорт медиафайлов</h1>
          <p>Добавьте видео и аудио для вашего монтажа</p>
        </div>
      </div>

      <div
        className="dropzone"
        onDrop={onDrop}
        onDragOver={(event) => event.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="dropzone-content">
          <div className="drop-icon">
            <img src="/cloud.png" alt="Upload" />
          </div>
          <h2>Перетащите файлы сюда</h2>
          <p>Или используйте кнопку ниже, чтобы выбрать файлы на</p>
          <p>вашем устройстве. Поддерживаются форматы до 1080p</p>
          <button type="button" className="primary-button" onClick={() => fileInputRef.current?.click()}>
            Обзор файлов
          </button>
          <div className="dropzone-footnote">MP4, MOV, AVI • MP3, WAV</div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".mp4,.mov,.avi,.mp3,.wav"
          className="hidden-input"
          onChange={(event) => handleFiles(event.target.files)}
        />
      </div>

      <div className="file-list-card">
        <h2>Загруженные файлы</h2>
        {files.length === 0 ? (
          <p className="empty-state">Пока нет загруженных файлов. Перетащите или выберите файлы выше</p>
        ) : (
          <div className="file-grid">
            {files.map((file) => (
              <div key={file.id} className="file-card">
                <div className={`file-pill file-pill-${file.type}`}>{file.type}</div>
                <div className="file-name">{file.name}</div>
                <div className="file-meta">{(file.size / 1024 / 1024).toFixed(1)} МБ</div>
                <button className="text-button" onClick={() => removeFile(file.id)}>
                  Удалить
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default UploadPage;
