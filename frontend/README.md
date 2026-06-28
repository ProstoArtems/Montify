# Montify Frontend

Простой React + TypeScript MVP фронтенд для онлайн-редактора видео.

## Запуск

1. Откройте терминал в папке `frontend`.
2. Установите зависимости:
```bash
npm install
```
3. Запустите локальный сервер:
```bash
npm run dev
```
4. Откройте `http://localhost:5173`.

## Страницы
- `/editor` — главный редактор с превью, таймлайном и медиатекой.
- `/upload` — загрузка видео и аудио.
- `/render` — настройки экспорта.

## Структура
- `src/context/SessionContext.tsx` — состояние сессии и медиафайлов.
- `src/pages/UploadPage.tsx` — загрузка файлов.
- `src/pages/EditorPage.tsx` — редактор и таймлайн.
- `src/pages/RenderPage.tsx` — экран рендеринга.
