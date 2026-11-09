(() => {
  'use strict';

  const { API_BASE } = window.APP_CONFIG;
  const socket = io(API_BASE);

  const myId = localStorage.getItem('user_id');
  const listEl = document.getElementById('conversationsList');

  async function loadConversations() {

    const res = await fetch(`${API_BASE}/chat/conversations`, {
      headers: { 'x-user-id': String(myId) }
    });

    const data = await res.json().catch(() => []);
    if (!res.ok || !Array.isArray(data)) return;

    listEl.innerHTML = '';

    if (data.length === 0) {
      listEl.innerHTML = '<p class="muted">Você ainda não possui conversas.</p>';
      return;
    }

    data.forEach(conv => {

      const imageUrl = conv.animal_photo
        ? `${API_BASE}/uploads/animals/${conv.animal_photo}`
        : '../assets/animal-placeholder.png';

      const card = document.createElement('div');
      card.className = 'conversation-card';

      card.innerHTML = `
        <img class="conversation-thumb" src="${imageUrl}">

        <div class="conversation-body">

          <div class="conversation-top">
            <div style="display:flex; align-items:center; gap:8px;">
              <strong>${conv.animal_name}</strong>

              ${
                conv.status === 'resolvido'
                  ? '<span class="badge resolvido">RESOLVIDO</span>'
                  : conv.status_type === 'perdido'
                  ? '<span class="badge perdido">PERDIDO</span>'
                  : '<span class="badge encontrado">ENCONTRADO</span>'
              }
            </div>

            ${conv.unread_count > 0 ? `<span class="badge">${conv.unread_count}</span>` : ''}
          </div>

          <div class="conversation-sub">
            ${conv.other_user_name}</div>
          </div>

        </div>
      `;

      card.addEventListener('click', () => {
        window.location.href =
          `chat.html?animal_id=${conv.animal_id}&to_user_id=${conv.other_user_id}`;
      });

      listEl.appendChild(card);
    });
  }

  socket.on('refresh_conversations', loadConversations);

  loadConversations();

})();