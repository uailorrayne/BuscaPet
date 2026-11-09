/**
 * Arquivo: map.js
 * Descrição: HOME map com localização automática/manual, busca por endereço,
 *            e exibição de animais próximos (Advanced Markers).
 * Projeto: BuscaPet
 */

(() => {
  'use strict';

  /* =======================
     Config (NUNCA declarar API_BASE fora do IIFE)
  ======================= */

  const cfg = window.APP_CONFIG || {};
  const API_BASE = cfg.API_BASE || 'http://localhost:3000';
  const MAP_ID = cfg.MAP_ID || ''; // mapId do Google (para Advanced Markers)

  let map;
  let userLocation = null;

  /** @type {google.maps.marker.AdvancedMarkerElement[]} */
  let markers = [];      // AdvancedMarkers dos animais
  /** @type {google.maps.marker.AdvancedMarkerElement|null} */
  let userMarker = null; // AdvancedMarker do usuário

  const RAIO_KM = 10;
  const DEFAULT_LOCATION = { lat: -19.74, lng: -47.89 };

  /* Chaves do localStorage */
  const LS_AUTO = 'use_auto_location';          // "1" ou "0"
  const LS_AUTO_LOC = 'user_location';          // {lat, lng}
  const LS_MANUAL_LOC = 'user_location_manual'; // {lat, lng}

  /* Busca por endereço (HOME) */
  let homeGeocoder = null;
  let homeAutocomplete = null;

  /* trava centro */
  let lockCenter = false;

  /* modo edição de localização do usuário */
  let editLocationMode = false;

  /* =======================
     Helpers de texto e filtro
  ======================= */

  function normalizeText(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function normalizeSpeciesToken(q) {
    const t = normalizeText(q);

    if (
      t === 'dog' ||
      t === 'cao' ||
      t === 'cachorro' ||
      t === 'cachorros' ||
      t === 'cachorra' ||
      t === 'cachorrinho' ||
      t === 'cachorrinha'
    ) return 'cachorro';

    if (
      t === 'cat' ||
      t === 'gato' ||
      t === 'gatos' ||
      t === 'gata' ||
      t === 'gatinho' ||
      t === 'gatinha'
    ) return 'gato';

    return '';
  }

  function markerMatchesQuery(marker, rawQuery) {
    const q = normalizeText(rawQuery);
    if (!q) return true;

    const meta = marker?._meta || {};
    const name = normalizeText(meta.name);
    const species = normalizeText(meta.species);
    const color = normalizeText(meta.color);

    if (name.includes(q) || color.includes(q) || species.includes(q)) return true;

    const sp = normalizeSpeciesToken(q);
    if (sp) {
      if (sp === 'cachorro' && (species.includes('cachorro') || species.includes('cao') || species.includes('cão') || species.includes('dog'))) return true;
      if (sp === 'gato' && (species.includes('gato') || species.includes('cat'))) return true;
    }

    return false;
  }

  function getIconBySpecies(species) {
    if (!species) return 'http://maps.google.com/mapfiles/ms/icons/red-dot.png';

    const tipo = String(species).toLowerCase();

    if (tipo.includes('cachorro') || tipo.includes('cao') || tipo.includes('cão') || tipo.includes('dog')) {
      return '../assets/icons/dog-marker.png';
    }

    if (tipo.includes('gato') || tipo.includes('cat')) {
      return '../assets/icons/cat-marker.png';
    }

    return 'http://maps.google.com/mapfiles/ms/icons/red-dot.png';
  }

  function setHint(text) {
    const el = document.getElementById('mapSearchHint');
    if (el) el.textContent = text || '';
  }

  function setSearchPlaceholder(text) {
    const input = document.getElementById('mapSearch');
    if (input) input.placeholder = text || '';
  }

  function makeImgMarkerContent(url, sizePx = 38) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'marker';
    img.style.width = `${sizePx}px`;
    img.style.height = `${sizePx}px`;
    img.style.transform = 'translateY(2px)';
    img.style.userSelect = 'none';
    img.style.pointerEvents = 'none';
    return img;
  }

  function hasAdvanced() {
    return !!(window.google?.maps?.marker?.AdvancedMarkerElement);
  }

  /* =======================
     Marker do usuário
  ======================= */

  function ensureUserMarker(position, draggable) {

    if (!map) return;

    if (!userMarker) {

      userMarker = new google.maps.Marker({
        position,
        map,
        draggable: !!draggable,
        title: 'Sua localização'
      });

      userMarker.addListener('click', () => {
        window.location.href = 'profile.html';
      });

      userMarker.addListener('dragend', () => {
        const p = userMarker.getPosition();
        if (!p) return;
        saveUserLocationManual(p.lat(), p.lng(), true);
      });

    } else {

      userMarker.setPosition(position);
      userMarker.setMap(map);
      userMarker.setDraggable(!!draggable);

    }
  }

  function saveUserLocationManual(lat, lng, centerNow) {
    const loc = { lat: Number(lat), lng: Number(lng) };
    if (Number.isNaN(loc.lat) || Number.isNaN(loc.lng)) return;

    userLocation = loc;

    localStorage.setItem(LS_AUTO_LOC, JSON.stringify(loc));
    localStorage.setItem(LS_MANUAL_LOC, JSON.stringify(loc));
    localStorage.setItem(LS_AUTO, '0');

    lockCenter = true;

    ensureUserMarker(loc, true);

    if (centerNow && map) {
      map.setCenter(loc);
      map.setZoom(14);
      setTimeout(() => {
        try { map.panBy(0, 140); } catch {}
      }, 50);
    }

    loadAnimalsOnMap();
  }

  function setEditLocationMode(on) {
    editLocationMode = !!on;

    if (editLocationMode) {
      setHint('Adicione sua localização: digite um endereço e aperte ➜, ou arraste o ponto azul no mapa.');
      setSearchPlaceholder('Adicione sua localização (endereço)...');

      localStorage.setItem(LS_AUTO, '0');
      lockCenter = true;

      const start = (() => {
        const manualRaw = localStorage.getItem(LS_MANUAL_LOC);
        if (manualRaw) {
          try { return JSON.parse(manualRaw); } catch {}
        }
        const autoRaw = localStorage.getItem(LS_AUTO_LOC);
        if (autoRaw) {
          try { return JSON.parse(autoRaw); } catch {}
        }
        return userLocation || DEFAULT_LOCATION;
      })();

      ensureUserMarker(start, true);
      if (map) map.setCenter(start);

    } else {
      setHint('Dica: aperte Enter ou use o botão ➜ para centralizar.');
      setSearchPlaceholder('Digite um endereço para centralizar o mapa...');

      if (userMarker) userMarker.gmpDraggable = false;
    }
  }

  /* =======================
     Busca por endereço (HOME)
  ======================= */

  function initHomeAddressSearch() {
    const input = document.getElementById('mapSearch');
    if (!input) return;

    if (!homeGeocoder && window.google?.maps?.Geocoder) {
      homeGeocoder = new google.maps.Geocoder();
    }

    if (!input.dataset.boundEnter) {
      input.dataset.boundEnter = '1';
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          searchAndCenterHome(input.value);
        }
      });
    }

    const btnMapSearch = document.getElementById('btnMapSearch');
    if (btnMapSearch && !btnMapSearch.dataset.boundClick) {
      btnMapSearch.dataset.boundClick = '1';
      btnMapSearch.addEventListener('click', () => searchAndCenterHome(input.value));
    }

    const btnEdit = document.getElementById('btnGpsLocation');
    if (btnEdit && !btnEdit.dataset.boundClick) {
      btnEdit.dataset.boundClick = '1';
      btnEdit.addEventListener('click', () => {
        setEditLocationMode(!editLocationMode);
        input.focus();
      });
    }

    if (!homeAutocomplete && window.google?.maps?.places?.Autocomplete) {
      homeAutocomplete = new google.maps.places.Autocomplete(input, {
        fields: ['geometry', 'formatted_address'],
        types: ['geocode'],
        componentRestrictions: { country: 'br' }
      });

      homeAutocomplete.addListener('place_changed', () => {
        const place = homeAutocomplete.getPlace();
        if (!place?.geometry?.location) return;

        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();

        if (editLocationMode) {
          saveUserLocationManual(lat, lng, true);
          return;
        }

        centerHomeToLatLng(lat, lng, place.formatted_address || 'Endereço selecionado', true);
      });
    }
  }

  function searchAndCenterHome(text) {
    const q = (text || '').trim();
    if (!q) return;

    if (!homeGeocoder) {
      alert('Geocoder não disponível. Verifique o carregamento do Google Maps.');
      return;
    }

    homeGeocoder.geocode({ address: q }, (results, status) => {
      if (status !== 'OK' || !results || results.length === 0) {
        alert('Endereço não encontrado. Tente escrever de outro jeito.');
        return;
      }

      const best = results[0];
      const loc = best.geometry.location;
      const lat = loc.lat();
      const lng = loc.lng();

      if (editLocationMode) {
        saveUserLocationManual(lat, lng, true);
        return;
      }

      centerHomeToLatLng(lat, lng, best.formatted_address || 'Endereço localizado', true);
    });
  }

  function centerHomeToLatLng(lat, lng, labelText, triggeredBySearch = false) {
    if (!map) return;

    const loc = { lat, lng };
    userLocation = loc;

    localStorage.setItem(LS_AUTO_LOC, JSON.stringify(loc));

    if (triggeredBySearch) lockCenter = true;

    map.setCenter(loc);
    map.setZoom(14);

    setTimeout(() => {
      if (map) map.panBy(0, 140);
    }, 50);

    loadAnimalsOnMap();
  }

  /* Init Map (HOME)
     O Google chama isso pelo callback=initHomeMap */

  window.initHomeMap = function () {
    // se mapId estiver vazio, o mapa ainda pode aparecer, mas AdvancedMarker reclama
    if (!MAP_ID) {
      console.warn('MAP_ID vazio no config.js. Advanced Markers podem alertar.');
    }

    initHomeAddressSearch();

    // lê última localização conhecida
    const lastAutoRaw = localStorage.getItem(LS_AUTO_LOC);
    if (lastAutoRaw) {
      try { userLocation = JSON.parse(lastAutoRaw); } catch {}
    }

    const start = userLocation || DEFAULT_LOCATION;

    map = new google.maps.Map(document.getElementById('map'), {
      center: start,
      zoom: 12,
      mapId: MAP_ID || undefined,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false
    });

    ensureUserMarker(start, false);

    map.addListener('click', (e) => {
      if (!editLocationMode) return;
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      saveUserLocationManual(lat, lng, false);
      ensureUserMarker({ lat, lng }, true);
    });

    // se tiver manual salva, prioriza
    const manualRaw = localStorage.getItem(LS_MANUAL_LOC);
    if (manualRaw) {
      try {
        const m = JSON.parse(manualRaw);
        if (typeof m.lat === 'number' && typeof m.lng === 'number') {
          userLocation = m;
          localStorage.setItem(LS_AUTO, '0');
          lockCenter = true;
          ensureUserMarker(m, false);
          map.setCenter(m);
        }
      } catch {}
    }

    loadAnimalsOnMap();
  };

  /* Animais no mapa */

  async function loadAnimalsOnMap() {
    try {
      // usa o config, não hardcode
      const response = await fetch(`${API_BASE}/animals`);
      if (!response.ok) return;

      const animals = await response.json();
      if (!Array.isArray(animals)) return;

      const bounds = new google.maps.LatLngBounds();

      // remove antigos
      markers.forEach(m => { m.map = null; });
      markers = [];

      const base = userLocation || DEFAULT_LOCATION;

      for (const animal of animals) {
        const lat = Number(animal.latitude);
        const lng = Number(animal.longitude);
        if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

        const distancia = calcularDistancia(base.lat, base.lng, lat, lng);
        if (distancia > RAIO_KM) continue;

        if (!hasAdvanced()) continue;

        const iconUrl = getIconBySpecies(animal.species);
        const content = makeImgMarkerContent(iconUrl, 38);

        const mk = new google.maps.marker.AdvancedMarkerElement({
          position: { lat, lng },
          map,
          title: animal.name || 'Animal',
          content
        });

        mk._meta = {
          name: animal.name || '',
          species: animal.species || '',
          color: animal.color || ''
        };

        mk.addListener('gmp-click', () => {
          // seu projeto usa pages/animal.html
          window.location.href = `animal.html?id=${animal.id}`;
        });

        markers.push(mk);
        bounds.extend(new google.maps.LatLng(lat, lng));
      }

      if (!lockCenter) {
        bounds.extend(new google.maps.LatLng(base.lat, base.lng));
        map.fitBounds(bounds);
      }
    } catch (error) {
      console.error('Erro ao carregar animais:', error);
    }
  }

  function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(deg2rad(lat1)) *
        Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) ** 2;

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function deg2rad(deg) {
    return deg * (Math.PI / 180);
  }

  /* Exports usados pelo home.html */

  window.centerMapToAnimal = function (lat, lng, zoom = 15, yOffsetPx = 0) {
    if (!map) return;

    const pos = { lat: Number(lat), lng: Number(lng) };
    if (Number.isNaN(pos.lat) || Number.isNaN(pos.lng)) return;

    map.setZoom(zoom);
    map.panTo(pos);

    if (typeof yOffsetPx === 'number' && yOffsetPx !== 0) {
      setTimeout(() => {
        try { map.panBy(0, yOffsetPx); } catch {}
      }, 250);
    }
  };

  window.filterMapMarkersByQuery = function (q) {
    const query = String(q || '');

    if (!query.trim()) {
      markers.forEach(m => { m.map = map; });
      return;
    }

    markers.forEach(m => {
      const ok = markerMatchesQuery(m, query);
      m.map = ok ? map : null;
    });
  };

})();

async function updateGlobalChatBadge() {

  const API_BASE = window.APP_CONFIG?.API_BASE;
  const userId = localStorage.getItem('user_id');
  if (!API_BASE || !userId) return;

  try {
    const res = await fetch(`${API_BASE}/chat/conversations`, {
      headers: { 'x-user-id': String(userId) }
    });

    const data = await res.json().catch(() => []);
    if (!Array.isArray(data)) return;

    const total = data.reduce((sum, c) => sum + (c.unread_count || 0), 0);

    const badge = document.getElementById('chatGlobalBadge');
    if (!badge) return;

    if (total > 0) {
      badge.hidden = false;
      badge.textContent = total;
    } else {
      badge.hidden = true;
    }

  } catch (err) {
    console.error('Erro badge global:', err);
  }
}

updateGlobalChatBadge();

  const socket = io(window.APP_CONFIG.API_BASE);

  socket.on('refresh_conversations', () => {
    updateGlobalChatBadge();
  });