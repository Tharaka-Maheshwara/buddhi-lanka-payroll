import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthProvider';
import { App } from './app/App';
import './styles/index.css';
createRoot(document.getElementById('root')).render(<React.StrictMode><BrowserRouter><AuthProvider><App/></AuthProvider></BrowserRouter></React.StrictMode>);
