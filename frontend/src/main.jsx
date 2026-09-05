import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import DemoSessionProvider from './session/DemoSessionProvider.jsx';
import './index.css';

// The session provider sits outside the router so bootstrap runs once per
// browser load, not once per route change.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DemoSessionProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </DemoSessionProvider>
  </StrictMode>
);
