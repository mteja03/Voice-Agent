import { io } from 'socket.io-client';

// In production (Vercel), set VITE_BACKEND_URL to the Railway backend URL.
const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export const socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 8000,
  timeout: 25000,
});

// Centralized socket diagnostics for connection lifecycle visibility.
socket.on('connect', () => {
  console.log(`[Socket] Connected: id=${socket.id} url=${SOCKET_URL}`);
});

socket.on('disconnect', (reason) => {
  console.warn(`[Socket] Disconnected: reason=${reason}`);
});

socket.on('connect_error', (err) => {
  console.error(`[Socket] Connect error: ${err.message}`);
});

socket.io.on('reconnect_attempt', (attempt) => {
  console.warn(`[Socket] Reconnect attempt #${attempt}`);
});

socket.io.on('reconnect', (attempt) => {
  console.log(`[Socket] Reconnected after ${attempt} attempt(s)`);
});

socket.io.on('reconnect_error', (err) => {
  console.error(`[Socket] Reconnect error: ${err.message}`);
});
