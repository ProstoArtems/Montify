import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import EditorPage from './pages/EditorPage';
import UploadPage from './pages/UploadPage';
import RenderPage from './pages/RenderPage';

function App() {
  const location = useLocation();
  const isUploadPage = location.pathname === '/upload';
  const isRenderPage = location.pathname === '/render';
  const isEditorPage = location.pathname === '/' || location.pathname === '/editor';
  const isSpecialPage = isUploadPage || isRenderPage;

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
              <NavLink
                to="/render"
                className={({ isActive }) => isActive ? 'nav-link active export-button' : 'nav-link export-button'}
              >
                <span className="icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M5 20h14v-2H5v2zm7-18l-5 5h3v6h4V7h3l-5-5z" />
                  </svg>
                </span>
                Экспорт
              </NavLink>
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
