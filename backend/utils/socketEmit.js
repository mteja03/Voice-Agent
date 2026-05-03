/**
 * Normalized Socket.IO error payload for the client.
 * @param {'AUTH'|'SYSTEM'} type
 */
function emitSocketError(socket, type, message) {
  const t = type === 'AUTH' ? 'AUTH' : 'SYSTEM';
  socket.emit('error', {
    type: t,
    message: String(message || 'Something went wrong'),
  });
}

module.exports = { emitSocketError };
