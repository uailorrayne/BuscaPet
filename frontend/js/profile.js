/**
 * Arquivo: profile.js
 * Descrição: Perfil do usuário - dados + editar (modal) + avatar preview + excluir conta + lista meus animais
 * Projeto: BuscaPet
 */

(() => {
'use strict';

const { API_BASE } = window.APP_CONFIG;

let currentUser = null;
let selectedAvatarFile = null;

document.addEventListener('DOMContentLoaded', () => {
  bindProfileEditModal();
  bindAvatarPicker();
  loadProfile();
  loadMyAnimals();
});

async function loadProfile() {
  const userId = localStorage.getItem('user_id');
  if (!userId) return;

  const nameEl = document.getElementById('profileName');
  const userEl = document.getElementById('profileUser');
  const emailEl = document.getElementById('profileEmail');

  try {
    const res = await fetch(`${API_BASE}/users/${userId}`);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error('Erro /users:', data);
      if (nameEl) nameEl.textContent = 'Usuário';
      if (userEl) userEl.textContent = `#${userId}`;
      if (emailEl) emailEl.textContent = 'Não foi possível carregar';
      return;
    }

    currentUser = data;

    if (nameEl) nameEl.textContent = data.name || 'Usuário';
    if (userEl) userEl.textContent = data.username ? `@${data.username}` : `#${data.id || userId}`;
    if (emailEl) emailEl.textContent = data.email || '';

    renderAvatar(data);

    const btnEdit = document.getElementById('btnEditProfile');
    if (btnEdit) btnEdit.onclick = () => openProfileEditModal(data);

  } catch (err) {
    console.error('Erro loadProfile:', err);
  }
}

function renderAvatar(user) {
  const img = document.getElementById('profileAvatarImg');
  const icon = document.getElementById('profileAvatarIcon');
  if (!img || !icon) return;

  const avatarUrl =
    user?.avatar_url ||
    (user?.avatar ? `${API_BASE}/uploads/avatars/${user.avatar}` : '');

  if (avatarUrl) {
    img.src = avatarUrl;
    img.style.display = 'block';
    icon.style.display = 'none';
  } else {
    img.removeAttribute('src');
    img.style.display = 'none';
    icon.style.display = 'block';
  }
}

/* ---------------- MODAL EDITAR PERFIL ---------------- */

function bindProfileEditModal() {
  const modal = document.getElementById('editProfileModal');
  const btnCancel = document.getElementById('btnCancelProfileEdit');
  const btnSave = document.getElementById('btnSaveProfileEdit');
  const btnDelete = document.getElementById('btnDeleteAccount');

  if (!modal || !btnCancel || !btnSave || !btnDelete) return;

  if (modal.dataset.bound === '1') return;
  modal.dataset.bound = '1';

  btnCancel.onclick = closeProfileEditModal;
  btnSave.onclick = saveProfileEdit;
  btnDelete.onclick = deleteAccount;

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeProfileEditModal();
  });

  document.addEventListener('keydown', (e) => {
    if (!modal.hidden && e.key === 'Escape') closeProfileEditModal();
  });
}

function openProfileEditModal(user) {
  const modal = document.getElementById('editProfileModal');
  const msg = document.getElementById('profileEditMsg');
  if (msg) msg.textContent = '';

  const n = document.getElementById('editProfileName');
  const u = document.getElementById('editProfileUsername');
  const e = document.getElementById('editProfileEmail');
  const a = document.getElementById('editProfileAvatar');

  if (n) n.value = user?.name || '';
  if (u) u.value = user?.username || '';
  if (e) e.value = user?.email || '';
  if (a) a.value = '';

  selectedAvatarFile = null;
  renderAvatarPreviewFromExisting(user);

  if (modal) modal.hidden = false;
}

function closeProfileEditModal() {
  const modal = document.getElementById('editProfileModal');
  if (modal) modal.hidden = true;
}

/* ---------------- Upload avatar bonito + prévia ---------------- */

function bindAvatarPicker() {
  const input = document.getElementById('editProfileAvatar');
  if (!input) return;

  if (input.dataset.bound === '1') return;
  input.dataset.bound = '1';

  input.addEventListener('change', () => {
    const f = input.files && input.files[0] ? input.files[0] : null;
    selectedAvatarFile = f || null;
    renderAvatarPreviewFromFile(f);
  });
}

function renderAvatarPreviewFromExisting(user) {
  const grid = document.getElementById('avatarPreviewGrid');
  if (!grid) return;

  const url =
    user?.avatar_url ||
    (user?.avatar ? `${API_BASE}/uploads/avatars/${user.avatar}` : '');

  grid.innerHTML = '';
  if (!url) return;

  const item = document.createElement('div');
  item.className = 'preview-item';
  item.innerHTML = `<img src="${url}" alt="Avatar atual">`;
  grid.appendChild(item);
}

function renderAvatarPreviewFromFile(file) {
  const grid = document.getElementById('avatarPreviewGrid');
  if (!grid) return;

  grid.innerHTML = '';
  if (!file) return;

  const url = URL.createObjectURL(file);

  const item = document.createElement('div');
  item.className = 'preview-item';
  item.innerHTML = `<img src="${url}" alt="Prévia do avatar">`;
  grid.appendChild(item);

  const img = item.querySelector('img');
  if (img) {
    img.onload = () => URL.revokeObjectURL(url);
  }
}

/* ---------------- salvar perfil ---------------- */

async function saveProfileEdit() {
  const userId = localStorage.getItem('user_id');
  if (!userId) return;

  const msg = document.getElementById('profileEditMsg');
  if (msg) msg.textContent = 'Salvando...';

  const name = document.getElementById('editProfileName')?.value || '';
  const username = document.getElementById('editProfileUsername')?.value || '';
  const email = document.getElementById('editProfileEmail')?.value || '';

  const form = new FormData();
  if (name.trim()) form.append('name', name.trim());
  if (username.trim()) form.append('username', username.trim());
  if (email.trim()) form.append('email', email.trim());
  if (selectedAvatarFile) form.append('avatar', selectedAvatarFile);

  try {
    const res = await fetch(`${API_BASE}/users/${userId}`, {
      method: 'PUT',
      headers: { 'x-user-id': String(userId) },
      body: form
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (msg) msg.textContent = data.error || 'Erro ao salvar.';
      return;
    }

    closeProfileEditModal();

    if (data.user) {
      currentUser = data.user;

      const nameEl = document.getElementById('profileName');
      const userEl = document.getElementById('profileUser');
      const emailEl = document.getElementById('profileEmail');

      if (nameEl) nameEl.textContent = currentUser.name || 'Usuário';
      if (userEl) userEl.textContent = currentUser.username ? `@${currentUser.username}` : `#${currentUser.id || userId}`;
      if (emailEl) emailEl.textContent = currentUser.email || '';

      renderAvatar(currentUser);
    } else {
      await loadProfile();
    }

  } catch (e) {
    console.error('Erro saveProfileEdit:', e);
    if (msg) msg.textContent = 'Erro ao salvar.';
  }
}

/* ---------------- excluir conta ---------------- */

async function deleteAccount() {
  const userId = localStorage.getItem('user_id');
  if (!userId) return;

  const ok = confirm('Tem certeza que deseja EXCLUIR sua conta? Essa ação não pode ser desfeita.');
  if (!ok) return;

  const msg = document.getElementById('profileEditMsg');
  if (msg) msg.textContent = 'Excluindo conta...';

  try {
    const res = await fetch(`${API_BASE}/users/${userId}`, {
      method: 'DELETE',
      headers: { 'x-user-id': String(userId) }
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (msg) msg.textContent = data.error || 'Erro ao excluir conta.';
      return;
    }

    // limpa sessão e volta pro login
    localStorage.removeItem('user_id');
    closeProfileEditModal();
    window.location.href = 'login.html';

  } catch (e) {
    console.error('Erro deleteAccount:', e);
    if (msg) msg.textContent = 'Erro ao excluir conta.';
  }
}

/* ---------------- LISTA MEUS ANIMAIS ---------------- */

async function loadMyAnimals() {
  const userId = localStorage.getItem('user_id');
  const wrap = document.getElementById('profileAnimalsList');
  if (!wrap) return;

  if (!userId) {
    wrap.innerHTML = '<p class="muted">Sessão expirada.</p>';
    return;
  }

  wrap.innerHTML = '<p class="muted">Carregando...</p>';

  try {
    const res = await fetch(`${API_BASE}/animals`);
    const animals = await res.json().catch(() => []);

    if (!res.ok || !Array.isArray(animals)) {
      wrap.innerHTML = '<p class="muted">Erro ao carregar seus animais.</p>';
      return;
    }

    const mine = animals.filter(a => String(a.user_id) === String(userId));

    if (mine.length === 0) {
      wrap.innerHTML = '<p class="muted">Você ainda não cadastrou nenhum animal.</p>';
      return;
    }

    wrap.innerHTML = '';

    mine.forEach(animal => {
      const card = document.createElement('div');
      card.className = 'animal-card';

      const imageUrl = animal.photo
        ? `${API_BASE}/uploads/animals/${animal.photo}`
        : '../assets/animal-placeholder.png';

      card.innerHTML = `
        <img src="${imageUrl}" class="animal-photo">
        <div class="animal-info">
        <div style="display:flex; align-items:center; gap:8px;">
          <strong>${animal.name || 'Sem nome'}</strong>
          ${
            animal.status === 'resolvido'
              ? '<span class="badge resolvido">RESOLVIDO</span>'
              : animal.status_type === 'perdido'
                ? '<span class="badge perdido">PERDIDO</span>'
                : '<span class="badge encontrado">ENCONTRADO</span>'
          }
        </div>

          <span>Espécie: ${animal.species || '-'}</span>
          <span>Cor: ${animal.color || '-'}</span>
        </div>
      `;

      card.addEventListener('click', () => {
        window.location.href = `animal.html?id=${animal.id}`;
      });

      wrap.appendChild(card);
    });

  } catch (err) {
    console.error('Erro loadMyAnimals:', err);
    wrap.innerHTML = '<p class="muted">Erro ao carregar seus animais.</p>';
  }
}

})();