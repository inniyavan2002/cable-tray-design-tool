import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import { App } from './App';
import { startAutosave } from './state/projectStore';

const container = document.getElementById('root');
if (!container) throw new Error('index.html is missing the #root element');

startAutosave();
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
