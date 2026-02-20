// socket.js
const socketIO = require('socket.io');
let ioInstance = null;

// Initialize Socket.IO with the HTTP server
function init(server) {
  ioInstance = socketIO(server, {
    cors: { origin: '*' }
  });
  ioInstance.on('connection', socket => {
    console.log('Socket connected:', socket.id);
  });
  return ioInstance;
}

// Getter for io instance in other modules
function getIO() {
  if (!ioInstance) throw new Error('Socket.io not initialized!');
  return ioInstance;
}

module.exports = { init, getIO };
