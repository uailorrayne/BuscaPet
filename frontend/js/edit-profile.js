'use strict';

const API_BASE = 'http://localhost:3000';

document.addEventListener('DOMContentLoaded', () => {
  loadCurrentData();
  document.getElementById('btnSave')?.addEventListener('click', save);
});

async function loadCurrentData() {
  const userId = localStorage.getItem('user_id');
  if (!userId) return;

  try {
    const res = await fetch(`${API_BASE}/users/${userId}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;

    document.getElementById('editName').value = data.name || '';
    document.getElementById('editUsername').value = data.username || '';
    document.getElementById('editEmail').value = data.email || '';
  } catch {}
}

async function save() {
  const userId = localStorage.getItem('user_id');
  if (!userId) return;

  const msg = document.getElementById('msg');
  if (msg) msg.textContent = 'Salvando...';

  const name = document.getElementById('editName')?.value || '';
  const username = document.getElementById('editUsername')?.value || '';
  const email = document.getElementById('editEmail')?.value || '';
  const avatarFile = document.getElementById('editAvatar')?.files?.[0] || null;

  const form = new FormData();
  if (name.trim()) form.append('name', name.trim());
  if (username.trim()) form.append('username', username.trim());
  if (email.trim()) form.append('email', email.trim());
  if (avatarFile) form.append('avatar', avatarFile);

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

    if (msg) msg.textContent = 'Salvo com sucesso.';
    setTimeout(() => {
      window.location.href = 'profile.html';
    }, 400);

  } catch (e) {
    console.error(e);
    if (msg) msg.textContent = 'Erro ao salvar.';
  }
}
