(function () {
  const desktopQuery = window.matchMedia('(min-width: 641px)');

  function syncNavigationState() {
    document.querySelectorAll('.mpp-nav-menu').forEach((menu) => {
      if (!(menu instanceof HTMLDetailsElement)) return;
      if (desktopQuery.matches) {
        menu.open = true;
      } else {
        menu.open = false;
      }
    });
  }

  syncNavigationState();

  if (typeof desktopQuery.addEventListener === 'function') {
    desktopQuery.addEventListener('change', syncNavigationState);
  } else if (typeof desktopQuery.addListener === 'function') {
    desktopQuery.addListener(syncNavigationState);
  }

  document.addEventListener('click', (event) => {
    if (desktopQuery.matches) return;
    const link = event.target instanceof Element ? event.target.closest('.mpp-nav-links a') : null;
    if (!link) return;
    const menu = link.closest('.mpp-nav-menu');
    if (menu instanceof HTMLDetailsElement) {
      menu.open = false;
    }
  });
})();
