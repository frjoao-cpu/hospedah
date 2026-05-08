// ============================================================
// HOSPEDAH — Inicialização de rastreamento (GTM, Clarity, Meta
// Pixel, OneSignal). Carregado somente após consentimento LGPD.
//
// A função window.initTracking() é chamada:
//   • imediatamente, se o consentimento já foi registrado;
//   • pelo banner de cookies, quando o usuário clica "Aceitar".
// ============================================================

function initTracking() {
  // Google Tag Manager
  (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
  new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
  j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
  'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
  })(window,document,'script','dataLayer','GTM-1258221909856324');
  // Microsoft Clarity — mapas de calor e gravação de sessões
  (function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments);};
  t=l.createElement(r);t.async=1;t.src='https://www.clarity.ms/tag/'+i;
  y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
  })(window,document,'clarity','script','s5xr9k4m2p');
  // Meta Pixel — atribuído a window.fbq pelo snippet do Facebook
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments);};if(!f._fbq)f._fbq=n;
  n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s);}(window,
  document,'script','https://connect.facebook.net/en_US/fbevents.js');
  window.fbq('init','189867599448495');
  window.fbq('track','PageView');
  // OneSignal Web Push — notificações de promoções e novas propriedades
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(function(OneSignal) {
    OneSignal.init({ appId: 'd60b7815-e4c5-4cad-85e1-052aabc794bd', allowLocalhostAsSecureOrigin: true });
  });
  var _os = document.createElement('script');
  _os.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
  _os.defer = true;
  document.head.appendChild(_os);
}

if (localStorage.getItem('hospedah_consent') === 'accepted') { initTracking(); }
