// Keeps the Node.js event loop alive while async Promises (like @electron/packager and makers) are pending.
const timer = setInterval(() => {}, 1000)
// Unref timer on explicit process exit so it doesn't block clean shutdown
process.on('beforeExit', () => clearInterval(timer))
