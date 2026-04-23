(function initAuth(global) {
  const storage = global.RPGCore.storage;

  const ROLE_REDIRECT = {
    Admin: 'admin.html',
    Mestre: 'mestre.html',
  };

  function getRedirectForRole(role) {
    if (ROLE_REDIRECT[role]) {
      return ROLE_REDIRECT[role];
    }

    if (role === 'Jogador') {
      return storage.getFichaId() ? 'ficha.html' : null;
    }

    return null;
  }

  function logout(redirect = 'login.html') {
    storage.clearSession();
    const navigation = global.RPGCore.navigation;
    if (navigation) {
      navigation.goTo(redirect);
      return;
    }

    window.location.href = redirect;
  }

  function requireRole(allowedRoles, options = {}) {
    const {
      redirect = 'login.html',
      useAlert = false,
      message = 'Acesso negado.',
    } = options;

    const token = storage.getToken();
    const role = storage.getRole();

    if (!token || (allowedRoles.length && !allowedRoles.includes(role))) {
      if (useAlert) {
        window.alert(message);
      }

      const navigation = global.RPGCore.navigation;
      if (navigation) {
        navigation.goTo(redirect);
      } else {
        window.location.href = redirect;
      }
      return null;
    }

    return {
      token,
      role,
      email: storage.getEmail() || '',
      userId: storage.getUserId() || '',
      fichaId: storage.getFichaId() || '',
    };
  }

  global.RPGCore = global.RPGCore || {};
  global.RPGCore.auth = {
    getRedirectForRole,
    logout,
    requireRole,
  };
})(window);
