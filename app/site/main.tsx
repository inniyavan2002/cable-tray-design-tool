import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionProvider } from './components/loop';
import { Site } from './components/Site';
import './site.css';

const root = document.getElementById('root');
if (!root) throw new Error('site/index.html is missing the #root element');

// Motion follows the device unless the reader chooses otherwise (components/loop.tsx).
createRoot(root).render(
  <StrictMode>
    <MotionProvider>
      <Site />
    </MotionProvider>
  </StrictMode>,
);
