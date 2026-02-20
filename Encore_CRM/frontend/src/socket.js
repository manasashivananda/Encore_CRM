// src/socket.js
import { io } from 'socket.io-client';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

const socket = io(API_BASE_URL, {
    transports: ['websocket'],  // fallback optional
    auth: {
        token: localStorage.getItem('token') // optional if your server checks token
    }
});

export default socket;
