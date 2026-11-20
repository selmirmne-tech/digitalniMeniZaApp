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
  const [items, setItems] = useState([]);
  const [category, setCategory] = useState('Sve');
  const [loading, setLoading] = useState(Boolean(slug));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!rootNode) return undefined;
    const controller = new AbortController();

    async function loadMenu() {
      setLoading(true);
      setError('');
      try {
        const path = [rootNode, 'Menu', 'Podaci'].map(encodeURIComponent).join('/');
        const response = await fetch(`${ANDROID_DATABASE_URL}/${path}.json`, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) {
          throw new Error('Firebase trenutno ne dozvoljava javno čitanje ovog menija. Provjerite pravila za Menu/Podaci.');
        }
        if (!response.ok) throw new Error(`Greška pri učitavanju menija (HTTP ${response.status}).`);
        const data = await response.json();
        if (!data || typeof data !== 'object') throw new Error('Meni za ovaj restoran nije pronađen.');

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
        setItems(menuItems);
        setCategory('Sve');
      } catch (loadError) {
        if (loadError.name !== 'AbortError') setError(loadError.message || 'Ne mogu učitati meni.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadMenu();
    return () => controller.abort();
  }, [rootNode]);

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
        {loading && <div className="message">Učitavam meni…</div>}
        {!loading && error && <div className="message error" role="alert">{error}</div>}
        {!loading && !error && items.length === 0 && <div className="message">Trenutno nema artikala u meniju.</div>}
        {!loading && !error && items.length > 0 && <>
          <nav className="categories" aria-label="Kategorije menija">
            {categories.map((name) => <button key={name} className={category === name ? 'selected' : ''} onClick={() => setCategory(name)}>{name}</button>)}
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
