import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles.css';
import { installTokens } from './theme.js';

installTokens();

const host = document.getElementById('root');
if (!host) throw new Error('#root 를 찾지 못했습니다');

createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
