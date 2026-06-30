import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import EditorPage from './pages/EditorPage';
import UploadPage from './pages/UploadPage';
import RenderPage from './pages/RenderPage';
import { useSession } from './context/SessionContext';
import { API_BASE_URL } from './api';

function App() {
  const location = useLocation();
  const { sessionId, timelineSegments } = useSession();
  const isUploadPage = location.pathname === '/upload';
  const isRenderPage = location.pathname === '/render';
  const isEditorPage = location.pathname === '/' || location.pathname === '/editor';
  const isSpecialPage = isUploadPage || isRenderPage;

  const handleExportDownload = async () => {
    if (!sessionId) {
      alert('Сессия не инициализирована. Попробуйте заново открыть приложение.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/files/export/${sessionId}`);
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Ошибка при скачивании результата');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `final_${sessionId}.mp4`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert('Не удалось скачать итоговый файл. Убедитесь, что рендер завершён и файл доступен.');
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        {isSpecialPage ? (
          <div className="header-left">
            <NavLink to="/editor" className="import-button no-border-button">← К редактору</NavLink>
          </div>
        ) : (
          <>
            <div className="header-left">
              <NavLink to="/upload" className="import-button">+ Импорт</NavLink>
            </div>
            <nav className="nav-links">
              {!isEditorPage && (
                <NavLink to="/editor" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Editor</NavLink>
              )}
              <button
                type="button"
                className="nav-link export-button"
                onClick={handleExportDownload}
                disabled={!timelineSegments.length}
              >
                <span className="icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M5 20h14v-2H5v2zm7-18l-5 5h3v6h4V7h3l-5-5z" />
                  </svg>
                </span>
                Экспорт
              </button>
            </nav>
          </>
        )}
        <div className="brand">Montify</div>
      </header>
      <main className="main-content">
        <Routes>
          <Route path="/" element={<EditorPage />} />
          <Route path="/editor" element={<EditorPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/render" element={<RenderPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
