/**
 * Arquivo: add-animal.js
 * Descrição: Cadastro de animal + preview de fotos (1-6) + seleção de localização no mapa
 * Projeto: BuscaPet
 */

(() => {
  'use strict';

  // pega do config.js (evita redeclaração)
  const { API_BASE, MAP_ID } = window.APP_CONFIG || {};

  if (!API_BASE) console.warn('[add-animal.js] APP_CONFIG.API_BASE não definido (config.js carregou?)');
  if (!MAP_ID) console.warn('[add-animal.js] APP_CONFIG.MAP_ID não definido (config.js carregou?)');

  // Estado do mapa
  let addAnimalMap = null;
  let addAnimalMarker = null; // AdvancedMarker (ou Marker fallback)
  let mapPickerVisible = false;
  let pickedLatLng = null; // { lat, lng }

  // Fotos novas controladas (remover 1 por 1)
  let newPhotoFiles = [];

  // Places Autocomplete
  let placesAutocomplete = null;
  let placesBound = false;

  /* Helpers */

  function getUserId() {
    return localStorage.getItem('user_id') || '';
  }

  function setLocationLabel(text) {
    const el = document.getElementById('locationLabel');
    if (el) el.textContent = text || '';
  }

  function ensurePreviewGrid() {
    // cria um grid de preview logo após o label do upload, sem precisar alterar HTML
    const label = document.querySelector('label.upload-box[for="photo"]');
    if (!label) return null;

    let grid = document.getElementById('photoGrid');
    if (!grid) {
      grid = document.createElement('div');
      grid.id = 'photoGrid';
      grid.className = 'photo-grid';
      grid.style.marginTop = '10px';
      label.insertAdjacentElement('afterend', grid);
    }
    return grid;
  }

  function updatePhotoHint() {
    const hint = document.getElementById('photoHint');
    if (!hint) return;

    hint.textContent = newPhotoFiles.length
      ? `${newPhotoFiles.length} foto(s) selecionada(s) (máx 6)`
      : 'Clique para fazer upload (1 a 6 fotos)';
  }

  function syncInputFiles() {
    const input = document.getElementById('photo');
    if (!input) return;

    try {
      const dt = new DataTransfer();
      newPhotoFiles.forEach(f => dt.items.add(f));
      input.files = dt.files;
    } catch {
      // fallback em browsers antigos
    }

    updatePhotoHint();
  }

  function renderMainCirclePreview() {
    // Mantém o visual do seu auth.css (bolinha) mostrando a 1ª foto
    const preview = document.getElementById('photoPreview');
    if (!preview) return;

    preview.innerHTML = '';

    if (newPhotoFiles.length === 0) {
      preview.innerHTML = '<i class="fa-solid fa-camera"></i>';
      return;
    }

    const url = URL.createObjectURL(newPhotoFiles[0]);
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'Preview';
    img.onload = () => URL.revokeObjectURL(url);

    preview.appendChild(img);
  }

  function renderPhotoGrid() {
    const grid = ensurePreviewGrid();
    if (!grid) return;

    grid.innerHTML = '';

    newPhotoFiles.forEach((file, idx) => {
      const url = URL.createObjectURL(file);

      const card = document.createElement('div');
      card.className = 'photo-card';

      const img = document.createElement('img');
      img.src = url;
      img.alt = `Foto ${idx + 1}`;
      img.onload = () => URL.revokeObjectURL(url);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'photo-remove';
      btn.title = 'Remover foto';
      btn.innerHTML = '<i class="fa-solid fa-trash"></i>';
      btn.onclick = () => removePhotoAt(idx);

      card.appendChild(img);
      card.appendChild(btn);
      grid.appendChild(card);
    });
  }

  function removePhotoAt(index) {
    if (index < 0 || index >= newPhotoFiles.length) return;
    newPhotoFiles.splice(index, 1);
    syncInputFiles();
    renderMainCirclePreview();
    renderPhotoGrid();
  }

  /* Preview de fotos */

  function handlePhotoChange() {
    const input = document.getElementById('photo');
    if (!input) return;

    const selected = Array.from(input.files || []);

    // adiciona sem duplicar (nome+size+lastModified)
    selected.forEach((f) => {
      const key = `${f.name}__${f.size}__${f.lastModified}`;
      const exists = newPhotoFiles.some(x => `${x.name}__${x.size}__${x.lastModified}` === key);
      if (!exists) newPhotoFiles.push(f);
    });

    // limita a 6
    if (newPhotoFiles.length > 6) {
      newPhotoFiles = newPhotoFiles.slice(0, 6);
      alert('Você pode selecionar no máximo 6 fotos.');
    }

    syncInputFiles();
    renderMainCirclePreview();
    renderPhotoGrid();
  }

  /* MAPA (Picker) - Advanced Markers */

  function canUseAdvancedMarker() {
    return !!window.google?.maps?.marker?.AdvancedMarkerElement;
  }

  function makePinContent() {
    const img = document.createElement('img');
    img.src = getMarkerIconBySpecies();
    img.style.width = '40px';
    img.style.height = '40px';
    img.style.objectFit = 'contain';
    return img;
  }

  function getMarkerIconBySpecies() {
    const speciesSelect = document.getElementById('species');
    if (!speciesSelect) return '../assets/icons/cat-marker.png';

    const value = String(speciesSelect.value || '').toLowerCase();

    if (value.includes('cachorro')) {
      return '../assets/icons/dog-marker.png';
    }

    return '../assets/icons/cat-marker.png';
  }

  function setMarkerPosition(latLng) {
    if (!latLng) return;
    pickedLatLng = { lat: Number(latLng.lat), lng: Number(latLng.lng) };

    if (!addAnimalMarker) return;

    // AdvancedMarker
    if (canUseAdvancedMarker() && addAnimalMarker instanceof google.maps.marker.AdvancedMarkerElement) {
      addAnimalMarker.position = pickedLatLng;
      return;
    }

    // fallback Marker
    if (typeof addAnimalMarker.setPosition === 'function') {
      addAnimalMarker.setPosition(pickedLatLng);
    }
  }

  function centerMap(latLng, zoom) {
    if (!addAnimalMap || !latLng) return;
    addAnimalMap.setCenter(latLng);
    if (typeof zoom === 'number') addAnimalMap.setZoom(zoom);
  }

  function bindAddAnimalUI() {
    const input = document.getElementById('photo');
    if (input && !input.dataset.bound) {
      input.dataset.bound = '1';
      input.addEventListener('change', handlePhotoChange);
    }

    updatePhotoHint();
    renderMainCirclePreview();
    ensurePreviewGrid();
  }

  function tryInitGeolocation() {
    setLocationLabel('Localização: carregando...');

    if (!navigator.geolocation) {
      setLocationLabel('Localização: não disponível');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (!pickedLatLng) pickedLatLng = { lat, lng };
        setLocationLabel('Localização: pronta (você pode ajustar no mapa)');
      },
      () => {
        setLocationLabel('Localização: não disponível (use o mapa)');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  }

  /* Places Autocomplete (sugestões) */

  function setupPlacesAutocomplete() {
    if (placesBound) return;
    if (!window.google?.maps?.places?.Autocomplete) {
      // Se der isso aqui, 99% é Places API desabilitada no Google Cloud
      console.warn('[add-animal.js] Places Autocomplete não disponível. Verifique se "libraries=places" está carregando e se a Places API está habilitada no Google Cloud.');
      return;
    }

    const input = document.getElementById('locationSearch');
    if (!input) return;

    // Evita rebind
    placesBound = true;

    // Cria o autocomplete
    placesAutocomplete = new google.maps.places.Autocomplete(input, {
      fields: ['geometry', 'formatted_address', 'name'],
      // Você pode restringir por país se quiser:
      // componentRestrictions: { country: 'br' }
    });

    // Quando escolher uma sugestão
    placesAutocomplete.addListener('place_changed', () => {
      const place = placesAutocomplete.getPlace();
      if (!place || !place.geometry || !place.geometry.location) return;

      const loc = place.geometry.location;
      const latLng = { lat: loc.lat(), lng: loc.lng() };

      // garante mapa aberto/instanciado
      if (!addAnimalMap) {
        // se ainda não abriu, abre automaticamente
        if (typeof window.toggleMapPicker === 'function') window.toggleMapPicker();
      }

      // aplica no mapa/marker
      setMarkerPosition(latLng);
      centerMap(latLng, 15);

      // atualiza label
      setLocationLabel('Localização: selecionada pelo endereço');
    });
  }

  // callback do Google
  window.initAddAnimalMap = function () {
    tryInitGeolocation();
    bindAddAnimalUI();

    // tenta preparar autocomplete desde já (mesmo que o picker esteja fechado)
    setupPlacesAutocomplete();
  };

  window.toggleMapPicker = function () {
    const mapEl = document.getElementById('mapPicker');
    const searchWrap = document.getElementById('locationSearchWrap');
    if (!mapEl) return;

    mapPickerVisible = !mapPickerVisible;

    mapEl.style.display = mapPickerVisible ? 'block' : 'none';
    if (searchWrap) searchWrap.hidden = !mapPickerVisible;

    // Quando abrir, garante autocomplete ligado (caso antes o input estivesse inacessível)
    if (mapPickerVisible) setupPlacesAutocomplete();

    if (!mapPickerVisible) return;

    // cria o mapa quando abre
    if (!addAnimalMap && window.google?.maps) {
      const start = pickedLatLng || { lat: -19.74, lng: -47.89 }; // fallback Uberaba

      addAnimalMap = new google.maps.Map(mapEl, {
        center: start,
        zoom: 14,
        mapId: MAP_ID, // usa do config.js
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false
      });

      // marcador (AdvancedMarker)
      if (canUseAdvancedMarker()) {
        addAnimalMarker = new google.maps.marker.AdvancedMarkerElement({
          position: start,
          map: addAnimalMap,
          title: 'Local do animal',
          content: makePinContent() || undefined
        });
      } else {
        // fallback
        addAnimalMarker = new google.maps.Marker({
          position: start,
          map: addAnimalMap,
          title: 'Local do animal'
        });
      }

      addAnimalMap.addListener('click', (e) => {
        const lat = e.latLng.lat();
        const lng = e.latLng.lng();
        setMarkerPosition({ lat, lng });
        setLocationLabel('Localização: selecionada no mapa');
      });

    } else if (addAnimalMap) {
      // re-centraliza quando reabre
      const center = pickedLatLng || addAnimalMap.getCenter();
      try {
        addAnimalMap.setCenter(center);
        if (pickedLatLng) setMarkerPosition(pickedLatLng);
      } catch {}
    }
  };

  window.geocodeMapPickerInput = function (text) {
    const q = String(text || '').trim();
    if (!q) return;

    if (!window.google?.maps?.Geocoder) {
      alert('Geocoder não disponível.');
      return;
    }

    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: q }, (results, status) => {
      if (status !== 'OK' || !results || results.length === 0) {
        alert('Endereço não encontrado. Tente novamente.');
        return;
      }

      const loc = results[0].geometry.location;
      const latLng = { lat: loc.lat(), lng: loc.lng() };

      if (addAnimalMap) {
        centerMap(latLng, 15);
        setMarkerPosition(latLng);
      } else {
        // se mapa ainda não existe, abre e depois aplica
        if (typeof window.toggleMapPicker === 'function') window.toggleMapPicker();
        setTimeout(() => {
          centerMap(latLng, 15);
          setMarkerPosition(latLng);
        }, 0);
      }

      setLocationLabel('Localização: selecionada pelo endereço');
    });
  };

  /* CADASTRAR (POST /animals) */

  window.addAnimal = async function () {
    const userId = getUserId();
    if (!userId) {
      alert('Sessão expirada. Faça login novamente.');
      window.location.href = 'login.html';
      return;
    }

    const name = document.getElementById('name')?.value?.trim() || '';
    const species = document.getElementById('species')?.value?.trim() || '';
    const color = document.getElementById('color')?.value?.trim() || '';
    const description = document.getElementById('description')?.value?.trim() || '';
    const statusType = document.querySelector('input[name="status_type"]:checked')?.value || '';

    if (!name || !species || !color || !description) {
      alert('Preencha todos os campos.');
      return;
    }

    if (!statusType) {
      alert('Selecione se o animal é perdido ou encontrado.');
      return;
    }

    if (!newPhotoFiles || newPhotoFiles.length < 1) {
      alert('Selecione pelo menos 1 foto.');
      return;
    }

    if (!pickedLatLng) {
      alert('Não foi possível obter sua localização. Abra o mapa e selecione um ponto.');
      return;
    }

    const form = new FormData();
    form.append('name', name);
    form.append('species', species);
    form.append('color', color);
    form.append('description', description);
    form.append('status_type', statusType);
    form.append('latitude', String(pickedLatLng.lat));
    form.append('longitude', String(pickedLatLng.lng));
    form.append('user_id', String(userId)); // seu backend usa user_id no body

    newPhotoFiles.slice(0, 6).forEach((f) => form.append('photos', f));

    try {
      const res = await fetch(`${API_BASE}/animals`, {
        method: 'POST',
        headers: { 'x-user-id': String(userId) },
        body: form
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data.error || 'Erro ao cadastrar animal.');
        return;
      }

      alert('Animal cadastrado com sucesso!');

      // seu backend retorna: { message, id }
      if (data?.id) window.location.href = `animal.html?id=${data.id}`;
      else window.location.href = 'home.html';

    } catch (e) {
      console.error('Erro addAnimal:', e);
      alert('Erro ao cadastrar animal.');
    }
  };
})();/**
 * Arquivo: add-animal.js
 * Descrição: Cadastro de animal + preview de fotos (1-6) + seleção de localização no mapa
 * Projeto: BuscaPet
 */

(() => {
  'use strict';

  // pega do config.js (evita redeclaração)
  const { API_BASE, MAP_ID } = window.APP_CONFIG || {};

  if (!API_BASE) console.warn('[add-animal.js] APP_CONFIG.API_BASE não definido (config.js carregou?)');
  if (!MAP_ID) console.warn('[add-animal.js] APP_CONFIG.MAP_ID não definido (config.js carregou?)');

  // Estado do mapa
  let addAnimalMap = null;
  let addAnimalMarker = null; // AdvancedMarker (ou Marker fallback)
  let mapPickerVisible = false;
  let pickedLatLng = null; // { lat, lng }

  // Fotos novas controladas (remover 1 por 1)
  let newPhotoFiles = [];

  // Places Autocomplete
  let placesAutocomplete = null;
  let placesBound = false;

  /* Helpers */

  function getUserId() {
    return localStorage.getItem('user_id') || '';
  }

  function setLocationLabel(text) {
    const el = document.getElementById('locationLabel');
    if (el) el.textContent = text || '';
  }

  function ensurePreviewGrid() {
    // cria um grid de preview logo após o label do upload, sem precisar alterar HTML
    const label = document.querySelector('label.upload-box[for="photo"]');
    if (!label) return null;

    let grid = document.getElementById('photoGrid');
    if (!grid) {
      grid = document.createElement('div');
      grid.id = 'photoGrid';
      grid.className = 'photo-grid';
      grid.style.marginTop = '10px';
      label.insertAdjacentElement('afterend', grid);
    }
    return grid;
  }

  function updatePhotoHint() {
    const hint = document.getElementById('photoHint');
    if (!hint) return;

    hint.textContent = newPhotoFiles.length
      ? `${newPhotoFiles.length} foto(s) selecionada(s) (máx 6)`
      : 'Clique para fazer upload (1 a 6 fotos)';
  }

  function syncInputFiles() {
    const input = document.getElementById('photo');
    if (!input) return;

    try {
      const dt = new DataTransfer();
      newPhotoFiles.forEach(f => dt.items.add(f));
      input.files = dt.files;
    } catch {
      // fallback em browsers antigos
    }

    updatePhotoHint();
  }

  function renderMainCirclePreview() {
    // Mantém o visual do seu auth.css (bolinha) mostrando a 1ª foto
    const preview = document.getElementById('photoPreview');
    if (!preview) return;

    preview.innerHTML = '';

    if (newPhotoFiles.length === 0) {
      preview.innerHTML = '<i class="fa-solid fa-camera"></i>';
      return;
    }

    const url = URL.createObjectURL(newPhotoFiles[0]);
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'Preview';
    img.onload = () => URL.revokeObjectURL(url);

    preview.appendChild(img);
  }

  function renderPhotoGrid() {
    const grid = ensurePreviewGrid();
    if (!grid) return;

    grid.innerHTML = '';

    newPhotoFiles.forEach((file, idx) => {
      const url = URL.createObjectURL(file);

      const card = document.createElement('div');
      card.className = 'photo-card';

      const img = document.createElement('img');
      img.src = url;
      img.alt = `Foto ${idx + 1}`;
      img.onload = () => URL.revokeObjectURL(url);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'photo-remove';
      btn.title = 'Remover foto';
      btn.innerHTML = '<i class="fa-solid fa-trash"></i>';
      btn.onclick = () => removePhotoAt(idx);

      card.appendChild(img);
      card.appendChild(btn);
      grid.appendChild(card);
    });
  }

  function removePhotoAt(index) {
    if (index < 0 || index >= newPhotoFiles.length) return;
    newPhotoFiles.splice(index, 1);
    syncInputFiles();
    renderMainCirclePreview();
    renderPhotoGrid();
  }

  /* Preview de fotos */

  function handlePhotoChange() {
    const input = document.getElementById('photo');
    if (!input) return;

    const selected = Array.from(input.files || []);

    // adiciona sem duplicar (nome+size+lastModified)
    selected.forEach((f) => {
      const key = `${f.name}__${f.size}__${f.lastModified}`;
      const exists = newPhotoFiles.some(x => `${x.name}__${x.size}__${x.lastModified}` === key);
      if (!exists) newPhotoFiles.push(f);
    });

    // limita a 6
    if (newPhotoFiles.length > 6) {
      newPhotoFiles = newPhotoFiles.slice(0, 6);
      alert('Você pode selecionar no máximo 6 fotos.');
    }

    syncInputFiles();
    renderMainCirclePreview();
    renderPhotoGrid();
  }

  /* MAPA (Picker) - Advanced Markers */

  function canUseAdvancedMarker() {
    return !!window.google?.maps?.marker?.AdvancedMarkerElement;
  }

  function makePinContent() {
    const img = document.createElement('img');
    img.src = getMarkerIconBySpecies();
    img.style.width = '40px';
    img.style.height = '40px';
    img.style.objectFit = 'contain';
    return img;
  }

  function getMarkerIconBySpecies() {
    const speciesSelect = document.getElementById('species');
    if (!speciesSelect) return '../assets/icons/cat-marker.png';

    const value = String(speciesSelect.value || '').toLowerCase();

    if (value.includes('cachorro')) {
      return '../assets/icons/dog-marker.png';
    }

    return '../assets/icons/cat-marker.png';
  }

  function setMarkerPosition(latLng) {
    if (!latLng) return;
    pickedLatLng = { lat: Number(latLng.lat), lng: Number(latLng.lng) };

    if (!addAnimalMarker) return;

    // AdvancedMarker
    if (canUseAdvancedMarker() && addAnimalMarker instanceof google.maps.marker.AdvancedMarkerElement) {
      addAnimalMarker.position = pickedLatLng;
      return;
    }

    // fallback Marker
    if (typeof addAnimalMarker.setPosition === 'function') {
      addAnimalMarker.setPosition(pickedLatLng);
    }
  }

  function centerMap(latLng, zoom) {
    if (!addAnimalMap || !latLng) return;
    addAnimalMap.setCenter(latLng);
    if (typeof zoom === 'number') addAnimalMap.setZoom(zoom);
  }

  function bindAddAnimalUI() {
    const input = document.getElementById('photo');
    if (input && !input.dataset.bound) {
      input.dataset.bound = '1';
      input.addEventListener('change', handlePhotoChange);
    }

    updatePhotoHint();
    renderMainCirclePreview();
    ensurePreviewGrid();
  }

  function tryInitGeolocation() {
    setLocationLabel('Localização: carregando...');

    if (!navigator.geolocation) {
      setLocationLabel('Localização: não disponível');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (!pickedLatLng) pickedLatLng = { lat, lng };
        setLocationLabel('Localização: pronta (você pode ajustar no mapa)');
      },
      () => {
        setLocationLabel('Localização: não disponível (use o mapa)');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  }

  /* Places Autocomplete (sugestões) */

  function setupPlacesAutocomplete() {
    if (placesBound) return;
    if (!window.google?.maps?.places?.Autocomplete) {
      // Se der isso aqui, 99% é Places API desabilitada no Google Cloud
      console.warn('[add-animal.js] Places Autocomplete não disponível. Verifique se "libraries=places" está carregando e se a Places API está habilitada no Google Cloud.');
      return;
    }

    const input = document.getElementById('locationSearch');
    if (!input) return;

    // Evita rebind
    placesBound = true;

    // Cria o autocomplete
    placesAutocomplete = new google.maps.places.Autocomplete(input, {
      fields: ['geometry', 'formatted_address', 'name'],
      // Você pode restringir por país se quiser:
      // componentRestrictions: { country: 'br' }
    });

    // Quando escolher uma sugestão
    placesAutocomplete.addListener('place_changed', () => {
      const place = placesAutocomplete.getPlace();
      if (!place || !place.geometry || !place.geometry.location) return;

      const loc = place.geometry.location;
      const latLng = { lat: loc.lat(), lng: loc.lng() };

      // garante mapa aberto/instanciado
      if (!addAnimalMap) {
        // se ainda não abriu, abre automaticamente
        if (typeof window.toggleMapPicker === 'function') window.toggleMapPicker();
      }

      // aplica no mapa/marker
      setMarkerPosition(latLng);
      centerMap(latLng, 15);

      // atualiza label
      setLocationLabel('Localização: selecionada pelo endereço');
    });
  }

  // callback do Google
  window.initAddAnimalMap = function () {
    tryInitGeolocation();
    bindAddAnimalUI();

    // tenta preparar autocomplete desde já (mesmo que o picker esteja fechado)
    setupPlacesAutocomplete();
  };

  window.toggleMapPicker = function () {
    const mapEl = document.getElementById('mapPicker');
    const searchWrap = document.getElementById('locationSearchWrap');
    if (!mapEl) return;

    mapPickerVisible = !mapPickerVisible;

    mapEl.style.display = mapPickerVisible ? 'block' : 'none';
    if (searchWrap) searchWrap.hidden = !mapPickerVisible;

    // Quando abrir, garante autocomplete ligado (caso antes o input estivesse inacessível)
    if (mapPickerVisible) setupPlacesAutocomplete();

    if (!mapPickerVisible) return;

    // cria o mapa quando abre
    if (!addAnimalMap && window.google?.maps) {
      const start = pickedLatLng || { lat: -19.74, lng: -47.89 }; // fallback Uberaba

      addAnimalMap = new google.maps.Map(mapEl, {
        center: start,
        zoom: 14,
        mapId: MAP_ID, // usa do config.js
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false
      });

      // marcador (AdvancedMarker)
      if (canUseAdvancedMarker()) {
        addAnimalMarker = new google.maps.marker.AdvancedMarkerElement({
          position: start,
          map: addAnimalMap,
          title: 'Local do animal',
          content: makePinContent() || undefined
        });
      } else {
        // fallback
        addAnimalMarker = new google.maps.Marker({
          position: start,
          map: addAnimalMap,
          title: 'Local do animal'
        });
      }

      addAnimalMap.addListener('click', (e) => {
        const lat = e.latLng.lat();
        const lng = e.latLng.lng();
        setMarkerPosition({ lat, lng });
        setLocationLabel('Localização: selecionada no mapa');
      });

    } else if (addAnimalMap) {
      // re-centraliza quando reabre
      const center = pickedLatLng || addAnimalMap.getCenter();
      try {
        addAnimalMap.setCenter(center);
        if (pickedLatLng) setMarkerPosition(pickedLatLng);
      } catch {}
    }
  };

  window.geocodeMapPickerInput = function (text) {
    const q = String(text || '').trim();
    if (!q) return;

    if (!window.google?.maps?.Geocoder) {
      alert('Geocoder não disponível.');
      return;
    }

    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: q }, (results, status) => {
      if (status !== 'OK' || !results || results.length === 0) {
        alert('Endereço não encontrado. Tente novamente.');
        return;
      }

      const loc = results[0].geometry.location;
      const latLng = { lat: loc.lat(), lng: loc.lng() };

      if (addAnimalMap) {
        centerMap(latLng, 15);
        setMarkerPosition(latLng);
      } else {
        // se mapa ainda não existe, abre e depois aplica
        if (typeof window.toggleMapPicker === 'function') window.toggleMapPicker();
        setTimeout(() => {
          centerMap(latLng, 15);
          setMarkerPosition(latLng);
        }, 0);
      }

      setLocationLabel('Localização: selecionada pelo endereço');
    });
  };

  /* CADASTRAR (POST /animals) */

  window.addAnimal = async function () {
    const userId = getUserId();
    if (!userId) {
      alert('Sessão expirada. Faça login novamente.');
      window.location.href = 'login.html';
      return;
    }

    const name = document.getElementById('name')?.value?.trim() || '';
    const species = document.getElementById('species')?.value?.trim() || '';
    const color = document.getElementById('color')?.value?.trim() || '';
    const description = document.getElementById('description')?.value?.trim() || '';
    const statusType = document.querySelector('input[name="status_type"]:checked')?.value || '';

    if (!name || !species || !color || !description) {
      alert('Preencha todos os campos.');
      return;
    }

    if (!statusType) {
      alert('Selecione se o animal é perdido ou encontrado.');
      return;
    }

    if (!newPhotoFiles || newPhotoFiles.length < 1) {
      alert('Selecione pelo menos 1 foto.');
      return;
    }

    if (!pickedLatLng) {
      alert('Não foi possível obter sua localização. Abra o mapa e selecione um ponto.');
      return;
    }

    const form = new FormData();
    form.append('name', name);
    form.append('species', species);
    form.append('color', color);
    form.append('description', description);
    form.append('status_type', statusType);
    form.append('latitude', String(pickedLatLng.lat));
    form.append('longitude', String(pickedLatLng.lng));
    form.append('user_id', String(userId)); // seu backend usa user_id no body

    newPhotoFiles.slice(0, 6).forEach((f) => form.append('photos', f));

    try {
      const res = await fetch(`${API_BASE}/animals`, {
        method: 'POST',
        headers: { 'x-user-id': String(userId) },
        body: form
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data.error || 'Erro ao cadastrar animal.');
        return;
      }

      alert('Animal cadastrado com sucesso!');

      // seu backend retorna: { message, id }
      if (data?.id) window.location.href = `animal.html?id=${data.id}`;
      else window.location.href = 'home.html';

    } catch (e) {
      console.error('Erro addAnimal:', e);
      alert('Erro ao cadastrar animal.');
    }
  };
})();