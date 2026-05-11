import { io } from 'socket.io-client';
import { getAuthToken, notifyAuthInvalid } from './authSession';

function handleSocketServerError(payload) {
  if (payload?.type === 'AUTH') notifyAuthInvalid();
}

function isSocketAuthFailure(message) {
  if (!message) return false;
  const m = String(message);
  return (
    m === 'Unauthorized' ||
    m === 'Token expired' ||
    m.includes('Organization is no longer available')
  );
}

// In production (Vercel), set VITE_BACKEND_URL to the Railway backend URL.
const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// Playwright E2E: if a mock socket is injected via page.addInitScript(), use it
// instead of creating a real WebSocket connection to the backend.
const _mockSocket = typeof window !== 'undefined' && window.__PW_MOCK_SOCKET;

export const socket = _mockSocket
  ? _mockSocket
  : io(SOCKET_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      timeout: 25000,
      auth: (cb) => cb({ token: getAuthToken() }),
    });

// Centralized socket diagnostics for connection lifecycle visibility.
// Only wire real socket.io diagnostics when not using the mock.
if (!_mockSocket) socket.on('error', handleSocketServerError);

if (!_mockSocket) {
  socket.on('connect', () => {
    console.log(`[Socket] Connected: id=${socket.id} url=${SOCKET_URL}`);
  });

  socket.on('disconnect', (reason) => {
    console.warn(`[Socket] Disconnected: reason=${reason}`);
  });

  socket.on('connect_error', (err) => {
    console.error(`[Socket] Connect error: ${err.message}`);
    if (getAuthToken() && isSocketAuthFailure(err.message)) {
      notifyAuthInvalid();
      socket.io.opts.reconnection = false;
      socket.disconnect();
    }
  });

  socket.io.on('reconnect_attempt', (attempt) => {
    console.warn(`[Socket] Reconnect attempt #${attempt}`);
  });

  socket.io.on('reconnect', (attempt) => {
    console.log(`[Socket] Reconnected after ${attempt} attempt(s)`);
  });

  socket.io.on('reconnect_error', (err) => {
    console.error(`[Socket] Reconnect error: ${err.message}`);
    if (getAuthToken() && isSocketAuthFailure(err.message)) {
      socket.io.opts.reconnection = false;
      socket.disconnect();
      notifyAuthInvalid();
    }
  });
}
