// Same lightweight GA4 loader as uplink.spot.
// Enable with: <meta name="uplink-ga4-measurement-id" content="G-XXXXXXX">
// Local play is skipped so dev sessions stay out of the property.

(function initAnalytics() {
  const host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return;

  const dnt =
    navigator.doNotTrack === '1' ||
    window.doNotTrack === '1' ||
    navigator.msDoNotTrack === '1';
  if (dnt) return;

  const meta = document.querySelector('meta[name="uplink-ga4-measurement-id"]');
  const measurementId = meta?.getAttribute('content')?.trim();

  if (!measurementId) return;
  if (!/^G-[A-Z0-9]+$/i.test(measurementId)) {
    console.warn(
      '[analytics] Invalid GA4 Measurement ID in meta "uplink-ga4-measurement-id":',
      measurementId,
    );
    return;
  }

  const gtagScript = document.createElement('script');
  gtagScript.async = true;
  gtagScript.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(gtagScript);

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = window.gtag || gtag;

  gtag('js', new Date());
  gtag('config', measurementId, {
    send_page_view: true,
  });
})();
