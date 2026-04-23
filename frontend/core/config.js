(function initConfig(global) {
  const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);

  const config = {
    isLocalHost,
    API_BASE: isLocalHost ? 'http://localhost:3333' : 'https://grimorio-backend.onrender.com',
  };

  global.RPGCore = global.RPGCore || {};
  global.RPGCore.config = config;
})(window);
