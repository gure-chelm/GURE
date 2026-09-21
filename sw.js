/* ============================================================
   Pomocnik trybu offline (service worker)
   Dzięki niemu strona otwiera się także bez zasięgu — pokazuje
   wtedy ostatnio pobraną wersję katalogu i wcześniej oglądane zdjęcia.

   UWAGA: po każdej podmianie index.html na GitHubie podnieś numer
   w WERSJA poniżej (v1 → v2 …). Dzięki temu telefony na pewno
   pobiorą nową wersję zamiast pokazywać starą kopię.
============================================================ */
const WERSJA = 'katalog-v4';

const SZKIELET = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

/* Instalacja — zapisujemy szkielet strony */
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(WERSJA)
      .then(cache => Promise.all(SZKIELET.map(url => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

/* Aktywacja — kasujemy kopie ze starszych wersji */
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(klucze => Promise.all(klucze.filter(k => k !== WERSJA).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }

  /* Zapytania do bazy i logowania zawsze prosto z sieci — nigdy z kopii,
     żeby nie pokazywać nieaktualnych rekordów jako świeżych. */
  if (url.hostname.endsWith('supabase.co') &&
      (url.pathname.startsWith('/rest') || url.pathname.startsWith('/auth') || url.pathname.startsWith('/realtime'))) {
    return;
  }

  /* Sama strona: najpierw sieć (żeby od razu widzieć nową wersję),
     a gdy brak zasięgu — ostatnia zapisana kopia. */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(odp => {
          const kopia = odp.clone();
          caches.open(WERSJA).then(c => c.put('./index.html', kopia));
          return odp;
        })
        .catch(() => caches.match('./index.html').then(k => k || caches.match('./')))
    );
    return;
  }

  /* Zdjęcia z magazynu, czcionki, biblioteka Supabase:
     najpierw kopia (szybko i bez transferu), w tle dociągamy z sieci. */
  e.respondWith(
    caches.match(req).then(kopia => {
      const zSieci = fetch(req).then(odp => {
        if (odp && odp.ok) {
          const doZapisu = odp.clone();
          caches.open(WERSJA).then(c => c.put(req, doZapisu)).catch(() => {});
        }
        return odp;
      }).catch(() => kopia);
      return kopia || zSieci;
    })
  );
});
