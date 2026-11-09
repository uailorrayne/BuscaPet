/**
 * Arquivo: animals.js
 * Descrição: Lista de animais no Home (lost/mine) + cache + filtros para bottom sheet
 * Projeto: BuscaPet
 */

(() => {
  'use strict';

  const { API_BASE } = window.APP_CONFIG;

  let animalsCache = [];
  let lastRendered = []; // guarda a lista da aba atual (lost ou mine)

  /* Helpers */

  function getUserId() {
    return localStorage.getItem('user_id') || '';
  }

  function normalizeText(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  /* sinônimos de espécie */
  function normalizeSpeciesToken(q) {
    const t = normalizeText(q);

    // cachorro
    if (
      t === 'dog' ||
      t === 'dogs' ||
      t === 'cao' ||
      t === 'cachorro' ||
      t === 'cachorros' ||
      t === 'cachorra' ||
      t === 'cachorrinha' ||
      t === 'cachorrinho' ||
      t === 'canino' ||
      t === 'canina'
    ) return 'cachorro';

    // gato
    if (
      t === 'cat' ||
      t === 'cats' ||
      t === 'gato' ||
      t === 'gatos' ||
      t === 'gata' ||
      t === 'gatinha' ||
      t === 'gatinho' ||
      t === 'felino' ||
      t === 'felina'
    ) return 'gato';

    return '';
  }

  /* Regra única de filtro (nome/cor/espécie + sinônimos) */
  function animalMatchesQuery(animal, rawQuery) {
    const q = normalizeText(rawQuery);
    if (!q) return true;

    const name = normalizeText(animal?.name);
    const species = normalizeText(animal?.species);
    const color = normalizeText(animal?.color);

    // match direto
    if (name.includes(q) || species.includes(q) || color.includes(q)) return true;

    // match por sinônimo
    const sp = normalizeSpeciesToken(q);

    if (sp === 'cachorro') {
      return (
        species.includes('cachorro') ||
        species.includes('cachorra') ||
        species.includes('cao') ||
        species.includes('cão') ||
        species.includes('dog') ||
        species.includes('canino')
      );
    }

    if (sp === 'gato') {
      return (
        species.includes('gato') ||
        species.includes('gata') ||
        species.includes('cat') ||
        species.includes('felino')
      );
    }

    return false;
  }

  function getImageUrl(animal) {
    const filename =
      (Array.isArray(animal?.photos) && animal.photos[0]) ||
      animal?.photo ||
      '';

    if (filename) return `${API_BASE}/uploads/animals/${filename}`;
    return '../assets/animal-placeholder.png';
  }

  /* =======================
     DISTÂNCIA (HOME)
     - usa a MESMA fonte do map.js:
       user_location_manual > user_location > fallback
  ======================= */

  function getUserLocationForDistance() {
    const DEFAULT_LOCATION = { lat: -19.74, lng: -47.89 };

    const manualRaw = localStorage.getItem('user_location_manual');
    if (manualRaw) {
      try {
        const m = JSON.parse(manualRaw);
        if (typeof m.lat === 'number' && typeof m.lng === 'number') return m;
      } catch {}
    }

    const autoRaw = localStorage.getItem('user_location');
    if (autoRaw) {
      try {
        const a = JSON.parse(autoRaw);
        if (typeof a.lat === 'number' && typeof a.lng === 'number') return a;
      } catch {}
    }

    return DEFAULT_LOCATION;
  }

  function deg2rad(deg) {
    return deg * (Math.PI / 180);
  }

  function distanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(deg2rad(lat1)) *
        Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) ** 2;

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function formatDistance(meters) {
    const m = Number(meters);
    if (!Number.isFinite(m)) return '';

    if (m < 1000) return `${Math.round(m)} m`;

    const km = m / 1000;
    if (km < 10) return `${km.toFixed(1).replace('.', ',')} km`;
    return `${Math.round(km)} km`;
  }

  function getAnimalDistanceLabel(animal) {
    const lat = Number(animal?.latitude);
    const lng = Number(animal?.longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return '';

    const u = getUserLocationForDistance();
    const meters = distanceMeters(u.lat, u.lng, lat, lng);
    return formatDistance(meters);
  }

  /* =======================
     Render
  ======================= */

  function renderAnimalsList(list) {
    const wrap = document.getElementById('animals-list');
    if (!wrap) return;

    const arr = Array.isArray(list) ? list : [];
    lastRendered = arr;

    if (arr.length === 0) {
      wrap.innerHTML = '<p class="muted" style="color:#666; padding:12px;">Nenhum animal encontrado.</p>';
      return;
    }

    wrap.innerHTML = '';

    arr.forEach((animal) => {
      const card = document.createElement('div');
      card.className = 'animal-card';

      // status do animal (usado para badge "resolvido")
      const status = animal?.status;
      const statusType = animal?.status_type || 'perdido';

      const imgUrl = getImageUrl(animal);
      const distText = getAnimalDistanceLabel(animal);

      card.innerHTML = `
        <img src="${imgUrl}" alt="Foto do animal">
        <div class="animal-card-body">
          <div class="animal-card-top" style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
            <div style="display:flex; align-items:center; gap:6px;">
              <strong>${animal?.name || 'Sem nome'}</strong>
              ${
                status === 'resolvido'
                  ? '<span style="background:#2ecc71;color:#fff;padding:2px 6px;border-radius:6px;font-size:11px;">RESOLVIDO</span>'
                  : statusType === 'perdido'
                    ? '<span style="background:#e74c3c;color:#fff;padding:2px 6px;border-radius:6px;font-size:11px;">PERDIDO</span>'
                    : '<span style="background:#3498db;color:#fff;padding:2px 6px;border-radius:6px;font-size:11px;">ENCONTRADO</span>'
              }
            </div>
            <span class="animal-distance" style="color:#666; font-weight:600; font-size:13px;">
              ${distText || ''}
            </span>
          </div>
          <span style="display:block; color:#555; font-size:13px; margin-top:2px;">
            Espécie: ${animal?.species || 'Não informada'} &nbsp; Cor: ${animal?.color || 'Não informada'}
          </span>
        </div>
      `;

      card.addEventListener('click', () => {
        if (animal?.id) window.location.href = `animal.html?id=${animal.id}`;
      });

      wrap.appendChild(card);
    });
  }

  /* Loaders (Lost / Mine) */

  async function loadAnimals() {
    const wrap = document.getElementById('animals-list');
    if (wrap) wrap.innerHTML = '<p class="muted" style="color:#666; padding:12px;">Carregando...</p>';

    try {
      const res = await fetch(`${API_BASE}/animals`);
      const data = await res.json().catch(() => []);

      if (!res.ok || !Array.isArray(data)) {
        if (wrap) wrap.innerHTML = '<p class="muted" style="color:#666; padding:12px;">Erro ao carregar animais.</p>';
        animalsCache = [];
        lastRendered = [];
        return;
      }

      animalsCache = data;  

      // remove resolvidos da aba "perdidos"
      const ativos = animalsCache.filter(a => a.status !== 'resolvido');

      renderAnimalsList(ativos);

      if (typeof window.setAnimalsForMap === 'function') {
        window.setAnimalsForMap(animalsCache);
      }
    } catch (e) {
      console.error('Erro loadAnimals:', e);
      animalsCache = [];
      lastRendered = [];
      if (wrap) wrap.innerHTML = '<p class="muted" style="color:#666; padding:12px;">Erro ao carregar animais.</p>';
    }
  }

  async function loadMyAnimals() {
    const uid = getUserId();
    const wrap = document.getElementById('animals-list');
    if (!wrap) return;

    if (!uid) {
      wrap.innerHTML = '<p class="muted" style="color:#666; padding:12px;">Sessão expirada.</p>';
      lastRendered = [];
      return;
    }

    if (!Array.isArray(animalsCache) || animalsCache.length === 0) {
      await loadAnimals();
    }

    const mine = animalsCache.filter(a => String(a?.user_id) === String(uid));
    renderAnimalsList(mine);
  }

  // Loaders (Resolved)
  async function loadResolvedAnimals() {
    const wrap = document.getElementById('animals-list');
    if (wrap) wrap.innerHTML = '<p style="padding:12px;">Carregando...</p>';

    try {
      const res = await fetch(`${API_BASE}/animals?status=resolvido`);
      const data = await res.json();

      if (!Array.isArray(data)) {
        if (wrap) wrap.innerHTML = '<p>Erro ao carregar.</p>';
        return;
      }

      // filtra apenas animais resolvidos
      renderAnimalsList(data);

    } catch (err) {
      console.error(err);
      if (wrap) wrap.innerHTML = '<p>Erro na conexão.</p>';
    }
  }

  /* Cache + filtros */

  function getAnimalsCache() {
    return animalsCache;
  }

  function getFilteredAnimalsForQuery(q) {
    const base =
      Array.isArray(lastRendered) && lastRendered.length > 0
        ? lastRendered
        : animalsCache;

    return base.filter(a => animalMatchesQuery(a, q));
  }

  function filterHomeListByQuery(q) {
    const filtered = getFilteredAnimalsForQuery(q);
    renderAnimalsList(filtered);
  }

  /* Exporta */
  window.loadAnimals = loadAnimals;
  window.loadMyAnimals = loadMyAnimals;
  window.loadResolvedAnimals = loadResolvedAnimals;
  window.renderAnimalsList = renderAnimalsList;
  window.getAnimalsCache = getAnimalsCache;
  window.getFilteredAnimalsForQuery = getFilteredAnimalsForQuery;
  window.filterHomeListByQuery = filterHomeListByQuery;

})();
