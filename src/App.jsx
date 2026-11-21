import { useEffect, useMemo, useState } from 'react';
import { ANDROID_DATABASE_URL, getRestaurantDisplayName, getRootNode } from './firebase.js';

function money(value) {
  const price = Number(value);
  return Number.isFinite(price)
    ? new Intl.NumberFormat('bs-BA', { style: 'currency', currency: 'EUR' }).format(price)
    : '';
}

function App() {
  const slug = decodeURIComponent(window.location.pathname.split('/').filter(Boolean)[0] || '').trim();
  const rootNode = slug ? getRootNode(slug) : '';
  // The MountainView public URL is an alias; its Firebase data lives under Restoran.
  const databaseRootNode = rootNode.toLocaleLowerCase('bs') === 'mountainview'
    ? 'Restoran'
    : rootNode;
  const [items, setItems] = useState([]);
  const [category, setCategory] = useState('Sve');
  const [menuType, setMenuType] = useState('food');
  const [loading, setLoading] = useState(Boolean(slug));
  const [error, setError] = useState('');
  const menuNode = menuType === 'drinks' ? 'Podaci1' : 'Podaci';

  useEffect(() => {
    if (!databaseRootNode) return undefined;
    const controller = new AbortController();
    const cacheKey = `digital-menu:${databaseRootNode}:${menuNode}`;
    const menuPath = [databaseRootNode, 'Menu', menuNode].map(encodeURIComponent).join('/');
    const versionPath = [databaseRootNode, 'Menu', 'createAtMillis'].map(encodeURIComponent).join('/');
    let eventStream;
    let currentVersion = '';
    let cachedMenu = null;
    let latestRequest = 0;

    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.items)) cachedMenu = parsed;
      }
    } catch {
      cachedMenu = null;
    }

    if (cachedMenu) {
      setItems(cachedMenu.items);
      setCategory('Sve');
      setLoading(false);
      setError('');
    } else {
      setItems([]);
      setLoading(true);
      setError('');
    }

    async function loadMenu(version) {
      const requestId = ++latestRequest;
      try {
        const response = await fetch(`${ANDROID_DATABASE_URL}/${menuPath}.json`, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) {
          if (menuNode === 'Podaci1') {
            if (!cachedMenu && !controller.signal.aborted) {
              setItems([]);
              setCategory('Sve');
              setLoading(false);
            }
            return;
          }
          throw new Error(`Firebase trenutno ne dozvoljava javno čitanje ovog menija. Provjerite pravila za Menu/${menuNode}.`);
        }
        if (!response.ok) throw new Error(`Greška pri učitavanju menija (HTTP ${response.status}).`);
        const data = await response.json();
        if (data == null) {
          if (controller.signal.aborted || requestId !== latestRequest) return;
          const emptyMenu = [];
          setItems(emptyMenu);
          setCategory('Sve');
          setLoading(false);
          setError('');
          try {
            localStorage.setItem(cacheKey, JSON.stringify({ version: String(version || ''), items: emptyMenu }));
          } catch { /* The menu still works if browser storage is unavailable. */ }
          cachedMenu = { version: String(version || ''), items: emptyMenu };
          return;
        }
        if (typeof data !== 'object') throw new Error('Meni za ovaj restoran nije pronađen.');

        const menuItems = Object.entries(data)
          .map(([id, value]) => ({ id, ...value }))
          .filter((item) => item && (item.name || item.description || item.price != null))
          .sort((a, b) => {
            const aNumber = Number(a.id);
            const bNumber = Number(b.id);
            return Number.isFinite(aNumber) && Number.isFinite(bNumber)
              ? aNumber - bNumber
              : a.id.localeCompare(b.id);
          });
        if (controller.signal.aborted || requestId !== latestRequest) return;
        setItems(menuItems);
        setCategory('Sve');
        setError('');
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ version: String(version || ''), items: menuItems }));
        } catch { /* The menu still works if browser storage is unavailable. */ }
        cachedMenu = { version: String(version || ''), items: menuItems };
      } catch (loadError) {
        if (loadError.name !== 'AbortError' && !cachedMenu) setError(loadError.message || 'Ne mogu učitati meni.');
      } finally {
        if (!controller.signal.aborted && requestId === latestRequest) setLoading(false);
      }
    }

    async function checkVersionAndRefresh(version) {
      const nextVersion = version == null ? '' : String(version);
      if (nextVersion === currentVersion && (cachedMenu || latestRequest > 0)) return;
      currentVersion = nextVersion;
      if (cachedMenu && String(cachedMenu.version || '') === nextVersion) return;
      if (!cachedMenu) setLoading(true);
      await loadMenu(nextVersion);
    }

    async function startVersionWatch() {
      try {
        const versionResponse = await fetch(`${ANDROID_DATABASE_URL}/${versionPath}.json`, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!versionResponse.ok) throw new Error('Verzija menija nije javno dostupna.');
        const version = await versionResponse.json();
        if (controller.signal.aborted) return;
        await checkVersionAndRefresh(version);

        // Firebase streams only the small version field. Menu items are fetched
        // again only when that value changes.
        if (typeof EventSource !== 'undefined') {
          eventStream = new EventSource(`${ANDROID_DATABASE_URL}/${versionPath}.json`);
          const onVersionEvent = (event) => {
            try {
              const payload = JSON.parse(event.data);
              const value = payload && typeof payload === 'object' && 'data' in payload
                ? payload.data
                : payload;
              checkVersionAndRefresh(value);
            } catch { /* Ignore malformed stream keep-alives or payloads. */ }
          };
          eventStream.addEventListener('put', onVersionEvent);
          eventStream.addEventListener('patch', onVersionEvent);
        }
      } catch (versionError) {
        if (controller.signal.aborted) return;
        // Existing cached items remain usable when timestamp access is restricted.
        if (!cachedMenu) await loadMenu('');
      }
    }

    startVersionWatch();
    return () => {
      controller.abort();
      if (eventStream) eventStream.close();
    };
  }, [databaseRootNode, menuNode]);

  const categories = useMemo(
    () => ['Sve', ...new Set(items.map((item) => item.category?.trim() || 'Ostalo'))],
    [items],
  );
  const menuGroups = useMemo(() => {
    const names = category === 'Sve' ? categories.slice(1) : [category];
    return names.map((name) => ({
      name,
      items: items.filter((item) => (item.category?.trim() || 'Ostalo') === name),
    })).filter((group) => group.items.length > 0);
  }, [items, category, categories]);

  function selectCategory(name) {
    setCategory(name);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (!slug) {
    return (
      <main className="landing">
        <span className="brand-mark">DM</span>
        <p className="eyebrow">Digitalni meni</p>
        <h1>Meni vašeg lokala, uvijek ažuran.</h1>
        <p className="lead">Otvorite QR link lokala, na primjer <code>/restoran</code>, da vidite njegov meni.</p>
      </main>
    );
  }

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-inner">
          <p className="eyebrow">Digitalni meni</p>
          <h1>{getRestaurantDisplayName(rootNode)}</h1>
          <p>Pronađite nešto po svom ukusu</p>
        </div>
      </header>
      <main className="content">
        <nav className="menu-types" aria-label="Izbor menija">
          <button
            className={`menu-type${menuType === 'food' ? ' selected' : ''}`}
            aria-pressed={menuType === 'food'}
            onClick={() => setMenuType('food')}
          >
            <span className="menu-type-icon-shell" aria-hidden="true">
              <svg className="menu-type-icon" viewBox="0 0 36 32">
                <circle cx="17.5" cy="16" r="9.3" />
                <circle cx="17.5" cy="16" r="5.8" />
                <path d="M3.5 4v6m3-6v6m3-6v6m-3-6v24m-3-18h6M31 3.5c-2.4 2.3-3.6 4.6-3.6 7.2a3.6 3.6 0 0 0 7.2 0c0-2.6-1.2-4.9-3.6-7.2ZM31 14v14" />
              </svg>
            </span>
            <span>HRANA</span>
          </button>
          <button
            className={`menu-type${menuType === 'drinks' ? ' selected' : ''}`}
            aria-pressed={menuType === 'drinks'}
            onClick={() => setMenuType('drinks')}
          >
            <span className="menu-type-icon-shell" aria-hidden="true">
              <svg className="menu-type-icon" viewBox="0 0 32 32">
                <path d="M8 4h16l-1.5 8.2a6.7 6.7 0 0 1-13 0L8 4Z" />
                <path d="M10 9h12M16 18v9m-5 2h10" />
              </svg>
            </span>
            <span>PIĆE</span>
          </button>
        </nav>
        {loading && <div className="message">Učitavam meni…</div>}
        {!loading && error && <div className="message error" role="alert">{error}</div>}
        {!loading && !error && items.length > 0 && <>
          <nav className="categories" aria-label="Kategorije menija">
            {categories.map((name) => <button key={name} className={category === name ? 'selected' : ''} onClick={() => selectCategory(name)}>{name}</button>)}
          </nav>
          <section className="menu-groups">
            {menuGroups.map((group) => <section className="menu-group" key={group.name}>
              <div className="group-heading">
                <div><h2>{group.name}</h2></div>
                <span className="group-count">{group.items.length} {group.items.length === 1 ? 'artikal' : 'artikala'}</span>
              </div>
              <div className="group-items">
                {group.items.map((item) => <article className="item-card" key={item.id}>
                  <div className="item-main"><h3>{item.name || 'Artikal'}</h3><strong>{money(item.price)}</strong></div>
                  {item.description && <p className="description">{item.description}</p>}
                </article>)}
              </div>
            </section>)}
          </section>
        </>}
      </main>
      <footer>Digitalni meni</footer>
    </div>
  );
}

export default App;
