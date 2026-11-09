/**
 * Arquivo: animal.js
 * Descrição: Detalhes do animal + carrossel + mapa + reverse geocoding + editar (somente dono)
 * Projeto: BuscaPet
 */

(() => {
  'use strict';

  // Config global (evita redeclaração)
  const cfg = window.APP_CONFIG || {};
  const API_BASE = cfg.API_BASE || 'http://localhost:3000';
  const MAP_ID = cfg.MAP_ID || '';

  let animalMap;
  let animalMarker;

  let carouselIndex = 0;
  let carouselImages = [];
  let isDragging = false;
  let startX = 0;
  let currentTranslate = 0;
  let prevTranslate = 0;

  let currentAnimal = null;
  let removedPhotoFilenames = new Set();
  let newPhotoFiles = [];

  //     Distância (mesma lógica do home)

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

  function renderDistance(animal) {
    const el = document.getElementById('animalDistance');
    if (!el) return;

    const lat = Number(animal?.latitude);
    const lng = Number(animal?.longitude);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      el.textContent = 'Não disponível';
      return;
    }

    const userLoc = getUserLocationForDistance();
    const meters = distanceMeters(userLoc.lat, userLoc.lng, lat, lng);
    el.textContent = formatDistance(meters) || 'Não disponível';
  }

  /* Maps + ícones por espécie */

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

  function makeImgMarkerContent(url, sizePx = 40) {
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

  function assertMapsReady() {
    if (!window.google?.maps) return false;
    if (!window.google?.maps?.marker?.AdvancedMarkerElement) return false;
    return true;
  }

  // Callback do Google Maps
  window.initMap = function () {
    carregarAnimal();
  };

  async function carregarAnimal() {
    const params = new URLSearchParams(window.location.search);
    const animalId = params.get('id');

    if (!animalId) {
      const n = document.getElementById('animalName');
      const a = document.getElementById('animalAddress');
      const d = document.getElementById('animalDistance');
      if (n) n.innerText = 'Animal não encontrado';
      if (a) a.innerText = 'Não disponível';
      if (d) d.innerText = 'Não disponível';
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/animals/${animalId}`);
      if (!response.ok) throw new Error('Erro ao buscar animal');

      const animal = await response.json();
      currentAnimal = animal;

      preencherDados(animal);
      renderDistance(animal);

      montarCarrossel(animal);
      iniciarMapaDoAnimal(animal);
      buscarEnderecoAproximado(animal);

      setupEditIfOwner(animal);
      setupResolveButton(animal);
      setupChatButton(animal);
    } catch (error) {
      console.error(error);
      const n = document.getElementById('animalName');
      const a = document.getElementById('animalAddress');
      const d = document.getElementById('animalDistance');
      if (n) n.innerText = 'Erro ao carregar dados do animal';
      if (a) a.innerText = 'Não disponível';
      if (d) d.innerText = 'Não disponível';
    }
  }

  function preencherDados(animal) {

    const n = document.getElementById('animalName');
    const badgeEl = document.getElementById('animalStatusBadge');

    if (badgeEl) {
      badgeEl.innerHTML =
        animal.status === 'resolvido'
          ? '<span class="badge resolvido">RESOLVIDO</span>'
          : animal.status_type === 'perdido'
            ? '<span class="badge perdido">PERDIDO</span>'
            : '<span class="badge encontrado">ENCONTRADO</span>'
    }
    
    const s = document.getElementById('animalSpecies');
    const c = document.getElementById('animalColor');
    const desc = document.getElementById('animalDescription');

    if (n) n.innerText = animal.name || 'Sem nome';
    if (s) s.innerText = animal.species || 'Não informada';
    if (c) c.innerText = animal.color || 'Não informada';
    if (desc) desc.innerText = animal.description || 'Sem descrição';
  }

  /* Botão de Chat */

  function setupChatButton(animal) {
    const btn = document.getElementById('btnContactOwner');
    if (!btn) return;

    const myId = localStorage.getItem('user_id');
    const ownerId = animal?.user_id;

    // Se for dono, esconde
    if (myId && ownerId && String(myId) === String(ownerId)) {
      btn.style.display = 'none';
      return;
    }

    // Se não for dono, mostra
    btn.style.display = 'inline-flex';

    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';

    btn.addEventListener('click', () => {
      if (!myId) {
        alert('Você precisa estar logado para entrar em contato.');
        window.location.href = 'login.html';
        return;
      }

      if (!animal?.id || !ownerId) {
        alert('Não foi possível iniciar o chat.');
        return;
      }

      window.location.href =
        `chat.html?animal_id=${encodeURIComponent(animal.id)}&to_user_id=${encodeURIComponent(ownerId)}`;
    });
  }

  /* Dono / editar */

  function setupEditIfOwner(animal) {
    const btn = document.getElementById('btnEditAnimal');
    const userId = localStorage.getItem('user_id');
    if (!btn) return;

    const isOwner = userId && String(animal.user_id) === String(userId);
    btn.style.display = isOwner ? 'grid' : 'none';

    if (!isOwner) return;

    if (!btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.onclick = () => openAnimalEditModal(animal);
    }

    bindAnimalEditModal();
  }

  function setupResolveButton(animal) {
    const btn = document.getElementById('resolveBtn');
    if (!btn) return;

    const userId = localStorage.getItem('user_id');
    const isOwner = userId && String(animal.user_id) === String(userId);

    /* só dono vê */
    btn.style.display = isOwner ? 'block' : 'none';

    /* se já estiver resolvido, esconde */
    if (animal.status === 'resolvido') {
      btn.style.display = 'none';
      return;
    }

    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';

    btn.onclick = async () => {
      const confirmar = confirm('Confirmar como resolvido?');
      if (!confirmar) return;

      try {
        const res = await fetch(`${API_BASE}/animals/${animal.id}/resolve`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': userId
          }
        });

        if (res.ok) {
          alert('Animal marcado como resolvido');
          window.location.href = 'home.html';
        } else {
          alert('Erro ao atualizar status');
        }
      } catch (e) {
        console.error(e);
        alert('Erro de conexão');
      }
    };
  }

  function bindAnimalEditModal() {
    const modal = document.getElementById('editAnimalModal');
    const btnCancel = document.getElementById('btnCancelAnimalEdit');
    const btnSave = document.getElementById('btnSaveAnimalEdit');
    const fileInput = document.getElementById('editAnimalPhotos');
    const btnDelete = document.getElementById('btnDeleteAnimal');

    if (!modal || !btnCancel || !btnSave) return;

    if (modal.dataset.bound === '1') return;
    modal.dataset.bound = '1';

    btnCancel.onclick = closeAnimalEditModal;
    btnSave.onclick = saveAnimalEdit;

    if (btnDelete) btnDelete.onclick = deleteAnimal;

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeAnimalEditModal();
    });

    document.addEventListener('keydown', (e) => {
      if (!modal.hidden && e.key === 'Escape') closeAnimalEditModal();
    });

    if (fileInput && !fileInput.dataset.bound) {
      fileInput.dataset.bound = '1';
      fileInput.addEventListener('change', () => handleNewPhotosSelection());
    }
  }

  function openAnimalEditModal(animal) {
    const modal = document.getElementById('editAnimalModal');
    const msg = document.getElementById('animalEditMsg');
    if (msg) msg.textContent = '';

    removedPhotoFilenames = new Set();
    newPhotoFiles = [];

    const n = document.getElementById('editAnimalName');
    const s = document.getElementById('editAnimalSpecies');
    const c = document.getElementById('editAnimalColor');
    const d = document.getElementById('editAnimalDescription');
    const p = document.getElementById('editAnimalPhotos');

    if (n) n.value = animal.name || '';
    if (s) s.value = animal.species || '';
    if (c) c.value = animal.color || '';
    if (d) d.value = animal.description || '';
    if (p) p.value = '';

    renderCurrentPhotos(animal);
    syncNewInputFiles();
    renderNewPhotosPreview();

    if (modal) modal.hidden = false;
  }

  function closeAnimalEditModal() {
    const modal = document.getElementById('editAnimalModal');
    if (modal) modal.hidden = true;
  }

  /* Fotos atuais (removíveis) */

  function renderCurrentPhotos(animal) {
    const wrap = document.getElementById('editAnimalCurrentPhotos');
    if (!wrap) return;

    const list = Array.isArray(animal.photos) ? animal.photos : (animal.photo ? [animal.photo] : []);
    wrap.innerHTML = '';

    list.forEach((filename) => {
      const card = document.createElement('div');
      card.className = 'photo-card';

      const img = document.createElement('img');
      img.src = `${API_BASE}/uploads/animals/${filename}`;
      img.alt = 'Foto do animal';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'photo-remove';
      btn.title = 'Remover foto';
      btn.innerHTML = '<i class="fa-solid fa-trash"></i>';

      btn.onclick = () => {
        const total = list.length;
        const willRemoveCount = removedPhotoFilenames.has(filename)
          ? (removedPhotoFilenames.size - 1)
          : (removedPhotoFilenames.size + 1);

        if (total - willRemoveCount < 1 && newPhotoFiles.length === 0) {
          alert('Você precisa manter pelo menos 1 foto.');
          return;
        }

        if (removedPhotoFilenames.has(filename)) removedPhotoFilenames.delete(filename);
        else removedPhotoFilenames.add(filename);

        card.classList.toggle('is-removed', removedPhotoFilenames.has(filename));
      };

      card.appendChild(img);
      card.appendChild(btn);
      wrap.appendChild(card);
    });
  }

  /* Fotos novas (preview + remover) */

  function handleNewPhotosSelection() {
    const input = document.getElementById('editAnimalPhotos');
    if (!input) return;

    const selected = Array.from(input.files || []);

    selected.forEach((f) => {
      const key = `${f.name}__${f.size}__${f.lastModified}`;
      const exists = newPhotoFiles.some(x => `${x.name}__${x.size}__${x.lastModified}` === key);
      if (!exists) newPhotoFiles.push(f);
    });

    if (newPhotoFiles.length > 6) {
      newPhotoFiles = newPhotoFiles.slice(0, 6);
      alert('Você pode selecionar no máximo 6 fotos.');
    }

    syncNewInputFiles();
    renderNewPhotosPreview();
  }

  function syncNewInputFiles() {
    const input = document.getElementById('editAnimalPhotos');
    if (!input) return;

    try {
      const dt = new DataTransfer();
      newPhotoFiles.forEach(f => dt.items.add(f));
      input.files = dt.files;
    } catch {}

    updateUploadText();
  }

  function updateUploadText() {
    const text = document.getElementById('editAnimalUploadText');
    if (!text) return;

    text.textContent = newPhotoFiles.length
      ? `${newPhotoFiles.length} arquivo(s) selecionado(s)`
      : 'Clique para fazer upload (1 a 6 fotos)';
  }

  function removeNewPhotoAt(index) {
    if (index < 0 || index >= newPhotoFiles.length) return;
    newPhotoFiles.splice(index, 1);
    syncNewInputFiles();
    renderNewPhotosPreview();
  }

  function renderNewPhotosPreview() {
    const wrap = document.getElementById('editAnimalNewPreview');
    if (!wrap) return;

    wrap.innerHTML = '';

    newPhotoFiles.forEach((file, idx) => {
      const url = URL.createObjectURL(file);

      const card = document.createElement('div');
      card.className = 'photo-card';

      const img = document.createElement('img');
      img.src = url;
      img.alt = 'Nova foto';
      img.onload = () => URL.revokeObjectURL(url);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'photo-remove';
      btn.title = 'Remover foto';
      btn.innerHTML = '<i class="fa-solid fa-trash"></i>';
      btn.onclick = () => removeNewPhotoAt(idx);

      card.appendChild(img);
      card.appendChild(btn);
      wrap.appendChild(card);
    });

    updateUploadText();
  }

  /* Salvar edição / excluir */

  async function saveAnimalEdit() {
    const userId = localStorage.getItem('user_id');
    if (!userId || !currentAnimal?.id) return;

    const msg = document.getElementById('animalEditMsg');
    if (msg) msg.textContent = 'Salvando...';

    const name = document.getElementById('editAnimalName')?.value || '';
    const species = document.getElementById('editAnimalSpecies')?.value || '';
    const color = document.getElementById('editAnimalColor')?.value || '';
    const description = document.getElementById('editAnimalDescription')?.value || '';

    const existingList = Array.isArray(currentAnimal.photos)
      ? currentAnimal.photos
      : (currentAnimal.photo ? [currentAnimal.photo] : []);

    const keepExistingCount = Math.max(0, existingList.length - removedPhotoFilenames.size);
    const totalAfter = keepExistingCount + newPhotoFiles.length;

    if (totalAfter < 1) {
      if (msg) msg.textContent = 'Você precisa manter pelo menos 1 foto.';
      alert('Você precisa manter pelo menos 1 foto.');
      return;
    }

    if (totalAfter > 6) {
      if (msg) msg.textContent = 'No máximo 6 fotos no total (atuais + novas).';
      alert('No máximo 6 fotos no total (atuais + novas).');
      return;
    }

    const form = new FormData();
    if (name.trim()) form.append('name', name.trim());
    if (species.trim()) form.append('species', species.trim());
    if (color.trim()) form.append('color', color.trim());
    if (description.trim()) form.append('description', description.trim());

    if (removedPhotoFilenames.size > 0) {
      form.append('remove_photos', JSON.stringify(Array.from(removedPhotoFilenames)));
    }

    newPhotoFiles.forEach((f) => form.append('photos', f));

    try {
      const res = await fetch(`${API_BASE}/animals/${currentAnimal.id}`, {
        method: 'PUT',
        headers: { 'x-user-id': String(userId) },
        body: form
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (msg) msg.textContent = data.error || 'Erro ao salvar.';
        return;
      }

      closeAnimalEditModal();

      if (data.animal) {
        currentAnimal = data.animal;
        preencherDados(currentAnimal);
        renderDistance(currentAnimal);
        montarCarrossel(currentAnimal);
        iniciarMapaDoAnimal(currentAnimal);
        buscarEnderecoAproximado(currentAnimal);
        setupEditIfOwner(currentAnimal);
        setupChatButton(currentAnimal);
      } else {
        await carregarAnimal();
      }
    } catch (e) {
      console.error('Erro saveAnimalEdit:', e);
      if (msg) msg.textContent = 'Erro ao salvar.';
    }
  }

  async function deleteAnimal() {
    const userId = localStorage.getItem('user_id');
    if (!userId || !currentAnimal?.id) return;

    const ok = confirm('Tem certeza que deseja excluir este animal? Essa ação não pode ser desfeita.');
    if (!ok) return;

    try {
      const res = await fetch(`${API_BASE}/animals/${currentAnimal.id}`, {
        method: 'DELETE',
        headers: { 'x-user-id': String(userId) }
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Erro ao excluir.');
        return;
      }

      alert('Animal excluído com sucesso.');
      window.location.href = 'home.html';
    } catch (e) {
      console.error('Erro deleteAnimal:', e);
      alert('Erro ao excluir.');
    }
  }

  /* Carrossel */

  function montarCarrossel(animal) {
    const track = document.getElementById('animalCarouselTrack');
    const dots = document.getElementById('animalCarouselDots');
    const btnPrev = document.getElementById('carouselPrev');
    const btnNext = document.getElementById('carouselNext');

    if (!track || !dots) return;

    const list = Array.isArray(animal.photos) && animal.photos.length > 0
      ? animal.photos
      : (animal.photo ? [animal.photo] : []);

    if (list.length === 0) carouselImages = ['../assets/animal-placeholder.png'];
    else carouselImages = list.map((f) => `${API_BASE}/uploads/animals/${f}`);

    carouselIndex = 0;
    track.innerHTML = '';
    dots.innerHTML = '';

    carouselImages.forEach((src, idx) => {
      const slide = document.createElement('div');
      slide.className = 'animal-carousel-slide';

      const img = document.createElement('img');
      img.src = src;
      img.alt = `Foto do animal ${idx + 1}`;

      slide.appendChild(img);
      track.appendChild(slide);

      const dot = document.createElement('span');
      dot.className = 'animal-dot' + (idx === 0 ? ' active' : '');
      dot.addEventListener('click', () => goToIndex(idx));
      dots.appendChild(dot);
    });

    if (btnPrev) btnPrev.onclick = () => goToIndex(carouselIndex - 1);
    if (btnNext) btnNext.onclick = () => goToIndex(carouselIndex + 1);

    addSwipeHandlers(track);
    updateCarousel(false);
  }

  function addSwipeHandlers(track) {
    track.addEventListener('touchstart', dragStart, { passive: true });
    track.addEventListener('touchmove', dragMove, { passive: true });
    track.addEventListener('touchend', dragEnd);

    track.addEventListener('mousedown', dragStart);
    track.addEventListener('mousemove', dragMove);
    track.addEventListener('mouseup', dragEnd);
    track.addEventListener('mouseleave', () => { if (isDragging) dragEnd(); });

    track.addEventListener('dragstart', (e) => e.preventDefault());
  }

  function dragStart(e) {
    isDragging = true;
    startX = getX(e);
    prevTranslate = -carouselIndex * getSlideWidth();
  }

  function dragMove(e) {
    if (!isDragging) return;
    const x = getX(e);
    const delta = x - startX;
    currentTranslate = prevTranslate + delta;
    setTranslate(currentTranslate, false);
  }

  function dragEnd() {
    if (!isDragging) return;
    isDragging = false;

    const movedBy = currentTranslate - prevTranslate;
    const threshold = getSlideWidth() * 0.18;

    if (movedBy < -threshold) goToIndex(carouselIndex + 1);
    else if (movedBy > threshold) goToIndex(carouselIndex - 1);
    else updateCarousel(true);
  }

  function getX(e) {
    return e.touches ? e.touches[0].clientX : e.clientX;
  }

  function getSlideWidth() {
    const carousel = document.getElementById('animalCarousel');
    return carousel ? carousel.clientWidth : 320;
  }

  function goToIndex(idx) {
    if (idx < 0) idx = 0;
    if (idx > carouselImages.length - 1) idx = carouselImages.length - 1;
    carouselIndex = idx;
    updateCarousel(true);
  }

  function updateCarousel(animate) {
    const track = document.getElementById('animalCarouselTrack');
    const dots = document.querySelectorAll('.animal-dot');
    if (!track) return;

    const width = getSlideWidth();
    currentTranslate = -carouselIndex * width;

    setTranslate(currentTranslate, animate);
    dots.forEach((d, i) => d.classList.toggle('active', i === carouselIndex));
  }

  function setTranslate(px, animate) {
    const track = document.getElementById('animalCarouselTrack');
    if (!track) return;

    track.style.transition = animate ? 'transform 0.25s ease' : 'none';
    track.style.transform = `translateX(${px}px)`;
  }

  /* Mapa */

  function iniciarMapaDoAnimal(animal) {
    const addr = document.getElementById('animalAddress');

    if (!assertMapsReady()) {
      if (addr) addr.innerText = 'Mapa não carregou corretamente.';
      return;
    }

    const lat = Number(animal.latitude);
    const lng = Number(animal.longitude);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      if (addr) addr.innerText = 'Localização não disponível';
      return;
    }

    const position = { lat, lng };

    animalMap = new google.maps.Map(document.getElementById('animalMap'), {
      center: position,
      zoom: 16,
      mapId: MAP_ID || undefined,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true
    });

    // Ícone do animal de acordo com a espécie (mesmo padrão visual do mapa da Home),
    // mas aqui exibimos APENAS o marcador do animal selecionado.
    const iconUrl = getIconBySpecies(animal.species);
    const content = makeImgMarkerContent(iconUrl, 42);

    animalMarker = new google.maps.marker.AdvancedMarkerElement({
      position,
      map: animalMap,
      title: animal.name || 'Animal',
      content
    });
  }

  function buscarEnderecoAproximado(animal) {
    const el = document.getElementById('animalAddress');
    if (!el) return;

    const lat = Number(animal.latitude);
    const lng = Number(animal.longitude);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      el.innerText = 'Não disponível';
      return;
    }

    if (!window.google?.maps?.Geocoder) {
      el.innerText = `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`;
      return;
    }

    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === 'OK' && results && results.length > 0) {
        el.innerText = results[0].formatted_address;
        return;
      }

      el.innerText = `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`;
    });
  }

  window.addEventListener('resize', () => {
    updateCarousel(false);
  });

})();