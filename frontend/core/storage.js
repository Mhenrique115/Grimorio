(function initStorage(global) {
  const KEYS = {
    token: 'rpg_token',
    role: 'rpg_role',
    userId: 'rpg_user_id',
    email: 'rpg_email',
    fichaId: 'rpg_ficha_id',
  };

  function get(key) {
    return localStorage.getItem(key);
  }

  function set(key, value) {
    if (value == null || value === '') {
      localStorage.removeItem(key);
      return;
    }

    localStorage.setItem(key, value);
  }

  function clearSession() {
    Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
  }

  function persistFichaId(fichaId) {
    set(KEYS.fichaId, fichaId);
  }

  global.RPGCore = global.RPGCore || {};
  global.RPGCore.storage = {
    KEYS,
    get,
    set,
    clearSession,
    persistFichaId,
    getToken: () => get(KEYS.token),
    getRole: () => get(KEYS.role),
    getUserId: () => get(KEYS.userId),
    getEmail: () => get(KEYS.email),
    getFichaId: () => get(KEYS.fichaId),
  };
})(window);
