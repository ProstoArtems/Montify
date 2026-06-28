const viteApiBaseUrl = (import.meta as ImportMeta & { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL;
export const API_BASE_URL = (viteApiBaseUrl || 'http://localhost:8080').replace(/\/$/, '');
