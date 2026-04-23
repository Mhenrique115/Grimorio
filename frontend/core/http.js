(function initHttp(global) {
  const config = global.RPGCore.config;

  function createApiClient({ tokenProvider = () => null, onUnauthorized = null } = {}) {
    return async function apiFetch(path, options = {}) {
      const token = tokenProvider();
      const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      };

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(`${config.API_BASE}${path}`, {
        ...options,
        headers,
      });

      if (response.status === 401 && typeof onUnauthorized === 'function') {
        onUnauthorized();
        throw new Error('Sessao expirada.');
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro');
      }

      return data;
    };
  }

  global.RPGCore = global.RPGCore || {};
  global.RPGCore.http = {
    createApiClient,
  };
})(window);
