/**
 * api.js — Centralized API configuration for LAN-ready access.
 *
 * Instead of hardcoding "localhost", we use the browser's current hostname.
 * This means any PC on the same network that opens:
 *   http://<server-ip>:5173
 * will automatically talk to the API at:
 *   http://<server-ip>:5000
 */

const API_HOST = window.location.hostname || 'localhost';
const API_PORT = window.__API_PORT__ || import.meta.env.VITE_API_PORT || 5000;

export const API_BASE = `http://${API_HOST}:${API_PORT}`;
