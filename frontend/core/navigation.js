(function initNavigation(global) {
  const ROUTES = {
    index: 'index.html',
    login: 'login.html',
    admin: 'admin.html',
    mestre: 'mestre.html',
    ficha: 'ficha.html',
    resetPassword: 'reset-password.html',
  };

  function getAppBasePath() {
    const pathname = window.location.pathname;
    const patterns = [
      /index\.html$/,
      /login\.html$/,
      /admin\.html$/,
      /mestre\.html$/,
      /ficha\.html$/,
      /reset-password\.html$/,
    ];

    for (const pattern of patterns) {
      if (pattern.test(pathname)) {
        return pathname.replace(pattern, '');
      }
    }

    return pathname.endsWith('/') ? pathname : `${pathname}/`;
  }

  function resolveRoute(routeNameOrFile) {
    const fileName = ROUTES[routeNameOrFile] || routeNameOrFile;
    return `${getAppBasePath()}${fileName}`;
  }

  function goTo(routeNameOrFile, { replace = false } = {}) {
    const target = resolveRoute(routeNameOrFile);
    if (replace) {
      window.location.replace(target);
      return;
    }

    window.location.href = target;
  }

  global.RPGCore = global.RPGCore || {};
  global.RPGCore.navigation = {
    ROUTES,
    getAppBasePath,
    resolveRoute,
    goTo,
  };
})(window);
