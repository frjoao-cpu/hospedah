'use strict';

(function () {
  var sidebar = document.getElementById('v2Sidebar');
  var menuBtn = document.getElementById('v2Menu');
  var frame = document.getElementById('systemFrame');
  var sectionName = document.getElementById('v2SectionName');
  var reloadBtn = document.getElementById('v2Reload');
  var navItems = Array.prototype.slice.call(document.querySelectorAll('.v2-nav-item'));

  var BASE_SRC = '/sistema.html?v=20261125c';
  var labels = {
    dashboard: 'Dashboard',
    caixa: 'Caixa',
    'captacao-resumo': 'Captações',
    reservas: 'Reservas',
    cobrancas: 'Cobranças',
    graficos: 'Gráficos',
    'fidelidade-admin': 'Fidelidade',
    automacoes: 'Automações',
    'config-ia': 'Concierge IA'
  };

  function setActive(target) {
    navItems.forEach(function (item) {
      var isActive = item.getAttribute('data-target') === target;
      item.classList.toggle('active', isActive);
    });
    sectionName.textContent = labels[target] || 'Dashboard';
  }

  function navigate(target, forceReload) {
    var hash = target ? '#' + target : '';
    setActive(target || 'dashboard');

    if (forceReload) {
      frame.src = BASE_SRC + hash;
      return;
    }

    try {
      if (frame.contentWindow && frame.contentWindow.location) {
        var current = frame.contentWindow.location.pathname || '';
        if (current.indexOf('/sistema.html') !== -1) {
          frame.contentWindow.location.hash = target;
          return;
        }
      }
    } catch (e) {
      // noop: fallback below
    }

    frame.src = BASE_SRC + hash;
  }

  navItems.forEach(function (item) {
    item.addEventListener('click', function () {
      var target = item.getAttribute('data-target') || 'dashboard';
      navigate(target, false);
      if (window.innerWidth <= 980) sidebar.classList.remove('open');
    });
  });

  if (menuBtn) {
    menuBtn.addEventListener('click', function () {
      sidebar.classList.toggle('open');
    });
  }

  if (reloadBtn) {
    reloadBtn.addEventListener('click', function () {
      var active = document.querySelector('.v2-nav-item.active');
      var target = active ? active.getAttribute('data-target') : 'dashboard';
      navigate(target, true);
    });
  }

  frame.addEventListener('load', function () {
    try {
      var hash = (frame.contentWindow.location.hash || '').replace('#', '');
      if (hash && labels[hash]) {
        setActive(hash);
      }
    } catch (e) {
      // ignore
    }
  });

  navigate('dashboard', false);
}());
