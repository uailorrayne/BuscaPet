/**
 * Arquivo: chat.js
 * Descrição: Rotas de chat (mensagens, áudio, imagem, conversas)
 * Projeto: BuscaPet
 */

(() => {
  'use strict';

  const { API_BASE } = window.APP_CONFIG;
  const socket = io(API_BASE);

  const myId = localStorage.getItem('user_id');

  if (!myId) {
    alert('Faça login.');
    window.location.href = 'login.html';
    return;
  }

  /* preview de imagem */

  const imagePreviewContainer = document.getElementById('imagePreviewContainer');
  const imagePreview = document.getElementById('imagePreview');
  const removePreview = document.getElementById('removePreview');

  const chatFileInput = document.getElementById('chatFileInput');

  let selectedImage = null;

  /* botão para remover preview da imagem */

  if (removePreview){
    removePreview.onclick = () => {

      /* libera memória da URL gerada para o preview */

      if (imagePreview.src) {
        URL.revokeObjectURL(imagePreview.src);
      }

      selectedImage = null;

      imagePreview.src = '';

      imagePreviewContainer.hidden = true;

      chatFileInput.value = '';

    };
  }

  /* parâmetros da URL */

  const params = new URLSearchParams(location.search);
  const animalId = params.get('animal_id');
  const toUserId = params.get('to_user_id');

  /* elementos do DOM */

  const chatBody = document.getElementById('chatBody');
  const chatText = document.getElementById('chatText');
  const btnSend = document.getElementById('btnSend');

  const btnUpload = document.getElementById('btnUpload');
  const btnRecord = document.getElementById('btnRecord'); // botão microfone

  const attachmentMenu = document.getElementById('attachmentMenu');
  const btnSendImage = document.getElementById('btnSendImage');
  const btnSendCamera = document.getElementById('btnSendCamera');
  const btnSendLocation = document.getElementById('btnSendLocation');

  const chatAnimalPhoto = document.getElementById('chatAnimalPhoto');
  const chatAnimalName = document.getElementById('chatAnimalName');
  const chatWithUser = document.getElementById('chatWithUser');

  /* indicador de digitação */

  const typingIndicator = document.getElementById('typingIndicator');

  /* localização com mapa */

  const locationSheet = document.getElementById('locationSheet');
  const confirmLocation = document.getElementById('confirmLocation');
  const cancelLocation = document.getElementById('cancelLocation');

  let map;
  let marker;
  let selectedLat;
  let selectedLng;

  /* botão para centralizar no GPS atual */

  const btnCenterLocation = document.getElementById('btnCenterLocation');

  if (btnCenterLocation) {

    btnCenterLocation.onclick = () => {

      if (!navigator.geolocation) return;

      navigator.geolocation.getCurrentPosition((pos)=>{

        selectedLat = pos.coords.latitude;
        selectedLng = pos.coords.longitude;

        /* atualiza posição do mapa e marcador */

        if (map && marker) {
          map.setView([selectedLat, selectedLng], 15);
          marker.setLatLng([selectedLat, selectedLng]);
        }

      });

    };

  }

  /* modal de imagem */

  const imageModal = document.getElementById("imageModal");
  const modalImage = document.getElementById("modalImage");
  const closeImageModal = document.getElementById("closeImageModal");

  let recordAction = 'send';

  /* controle de envio */

  let isSending = false;

  /* controle de gravação */

  let mediaRecorder = null;
  let audioChunks = [];

  let isRecording = false;
  let isLocked = false;
  let isPressing = false;
  let isPointerDown = false;
  let holdTimeout;

  let startX = 0;
  let startY = 0;
  let recordingStartTime = null;
  let recordingTimer = null;

  let pausedTime = 0;
  let pauseStart = 0;

  /* controle de mensagens renderizadas */

  let renderedMessages = new Set();

  let conversationId = null;

  /* verifica se usuário está perto do fim do chat */

  function shouldAutoScroll() {

    const threshold = 80;

    const distanceFromBottom =
      chatBody.scrollHeight - chatBody.scrollTop - chatBody.clientHeight;

    return distanceFromBottom < threshold;
  }

  /* abre imagem no modal */

  function openImage(src) {

    if (!imageModal) return;

    imageModal.style.display = "flex";
    modalImage.src = src;

  }

  /* renderiza mensagem no chat */

  function addMessage(msg) {

    if (!msg) return;

    /* evita renderizar mensagens totalmente vazias */
    const hasText = msg.text && msg.text.trim() !== '';
    const hasAudio = msg.audio_url && msg.audio_url.trim() !== '';

    if (!hasText && !hasAudio) {
      return;
    }

    if (msg.id && renderedMessages.has(msg.id)) return;

    if (msg.id) renderedMessages.add(msg.id);

    const autoScroll = shouldAutoScroll();

    const div = document.createElement('div');

    div.className =
      'msg ' + (String(msg.sender_id) === String(myId) ? 'me' : 'other');

    /* mensagem de áudio */

    if (
      msg.audio_url &&
      typeof msg.audio_url === 'string' &&
      msg.audio_url.trim() !== ''
    ) {

      const audio = document.createElement('audio');

      audio.controls = true;
      audio.src = API_BASE + msg.audio_url;

      /* só mostra se carregar de verdade */
      div.appendChild(audio);

      /* se falhar, NÃO mostra nada */
      audio.addEventListener('error', () => {
        console.warn('Erro ao carregar áudio:', msg.audio_url);
      });

    }

    /* mensagem de imagem */

    else if (msg.text && msg.text.startsWith('/uploads/chat-images')) {

      const img = document.createElement('img');

      img.src = API_BASE + msg.text;
      img.className = 'chat-image';

      img.onclick = () => openImage(img.src);

      div.appendChild(img);

    }

    /* mensagem de localização */

    else if (msg.text && msg.text.startsWith('https://maps.google.com')) {

      // extrai lat e lng da url
      const coords = msg.text.split('?q=')[1];

      if (coords) {

        const [lat, lng] = coords.split(',').map(Number);

        const locationDiv = document.createElement('div');
        locationDiv.className = 'message-location';
        locationDiv.dataset.lat = lat;
        locationDiv.dataset.lng = lng;

        locationDiv.innerHTML = `
          <div class="location-map"></div>

          <div class="location-info">
            <div class="location-address">Carregando endereço...</div>

            <a class="location-open" target="_blank">
              Abrir no Google Maps
            </a>
          </div>
        `;

        div.appendChild(locationDiv);

        // renderiza mapa
        setTimeout(() => {
          renderLocationMaps();
        }, 0);
      }

    }

    /* mensagem de texto normal */

    else {

      const span = document.createElement('span');
      span.className = 'msg-text';
      span.textContent = msg.text;

      div.appendChild(span);

    }


    chatBody.appendChild(div);

    if (autoScroll) {

      chatBody.scrollTo({
        top: chatBody.scrollHeight,
        behavior: 'smooth'
      });

    }
  }

  /* procura conversa existente */

  async function findExistingConversation() {

    const res = await fetch(`${API_BASE}/chat/conversations`, {
      headers: { 'x-user-id': String(myId) }
    });

    const data = await res.json().catch(() => []);

    if (!Array.isArray(data)) return null;

    const found = data.find(c =>
      String(c.animal_id) === String(animalId) &&
      String(c.other_user_id) === String(toUserId)
    );

    return found ? found.id : null;
  }

  /* carrega mensagens */

  async function loadMessages() {

    if (!conversationId) return;

    const res = await fetch(`${API_BASE}/chat/messages/${conversationId}`, {
      headers: { 'x-user-id': String(myId) }
    });

    const data = await res.json().catch(() => []);

    if (!Array.isArray(data)) return;

    chatBody.innerHTML = '';
    renderedMessages.clear();

    data.forEach(addMessage);
    renderLocationMaps();

    /* força scroll no primeiro carregamento */
    chatBody.scrollTop = chatBody.scrollHeight;

  }

  /* marca mensagens como lidas */

  async function markAsRead() {

    if (!conversationId) return;

    await fetch(`${API_BASE}/chat/conversations/${conversationId}/read`, {
      method: 'PUT',
      headers: { 'x-user-id': String(myId) }
    });

    socket.emit('refresh_conversations');
  }

  /* envio de mensagem de texto */

  async function sendMessage(text) {

    const res = await fetch(`${API_BASE}/chat/messages`, {

      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
        'x-user-id': String(myId)
      },

      body: JSON.stringify({
        animal_id: animalId,
        to_user_id: toUserId,
        text
      })

    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {

      alert(data.error || 'Erro ao enviar.');
      return null;

    }

    conversationId = data.conversation_id;

    socket.emit('join', { conversationId });

    socket.emit('send_message', {
      conversationId,
      message: data.message
    });

    return data.message;

  }

  /* envio de imagem */

  async function sendImage(file){

    const form = new FormData();

    form.append('image', file);
    form.append('animal_id', animalId);
    form.append('to_user_id', toUserId);

    const res = await fetch(`${API_BASE}/chat/messages/image`, {

      method: 'POST',

      headers: {
        'x-user-id': String(myId)
      },

      body: form

    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {

      alert(data.error || 'Erro ao enviar imagem.');
      return;

    }

    conversationId = data.conversation_id;

    socket.emit('join', { conversationId });

    socket.emit('send_message', {
      conversationId,
      message: data.message
    });

  }

  socket.on('new_message', addMessage);

  /* escuta quando outro usuário está digitando */

  socket.on('typing', () => {

    if (!typingIndicator) return;

    typingIndicator.style.display = 'block';

    clearTimeout(window.typingTimeout);

    /* remove indicador após alguns segundos */

    window.typingTimeout = setTimeout(() => {

      typingIndicator.style.display = 'none';

    }, 2000);

  });


  /* envio de mensagem */

  async function doSend() {

    if (isSending) return;

    isSending = true;

    /* se existe imagem selecionada envia imagem */

    if(selectedImage){

      await sendImage(selectedImage);

      if (imagePreview.src) {
        URL.revokeObjectURL(imagePreview.src);
      }

      selectedImage = null;

      imagePreview.src = '';

      imagePreviewContainer.hidden = true;

      chatFileInput.value = '';

      isSending = false;

      return;
    }

    const text = (chatText.value || '').trim();

    if (!text){
      isSending = false;
      return;
    }

    chatText.value = '';

    await sendMessage(text);

    isSending = false;

  }

  /* preview da imagem */

  function previewAndSendImage(){

    const file = chatFileInput.files[0];

    if(!file) return;

    /* valida se é imagem */

    if(!file.type.startsWith('image/')){
      alert('Selecione apenas imagens.');
      return;
    }

    selectedImage = file;

    imagePreview.src = URL.createObjectURL(file);

    imagePreviewContainer.hidden = false;
  }

  /* abre o seletor de localização com mapa */

  function openLocationPicker(){

    if (!navigator.geolocation){
      alert('Geolocalização não suportada.');
      return;
    }

    locationSheet.hidden = false;

    navigator.geolocation.getCurrentPosition((pos)=>{

      selectedLat = pos.coords.latitude;
      selectedLng = pos.coords.longitude;

      /* se o mapa ainda não existe, cria */

      if(!map){

        map = L.map('mapPreview').setView([selectedLat, selectedLng], 15);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
          attribution:'© OpenStreetMap'
        }).addTo(map);

        marker = L.marker([selectedLat, selectedLng], { draggable:true }).addTo(map);

        // permite arrastar o marcador

        marker.on('dragend', ()=>{

          const p = marker.getLatLng();
          selectedLat = p.lat;
          selectedLng = p.lng;

        });

      } else {

        // se já existe, só atualiza posição 

        map.setView([selectedLat, selectedLng], 15);
        marker.setLatLng([selectedLat, selectedLng]);

      }

    }, (err)=>{
      alert('Erro ao pegar localização');
    }, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    });

  }


  /* gravação de áudio */
  // mostra preview do áudio gravado 

  // inicialização

  async function start() {

    attachmentMenu.hidden = true;

    await loadChatContext();

    conversationId = await findExistingConversation();

    if (conversationId) {

      socket.emit('join', { conversationId });

      await loadMessages();

      await markAsRead();

    }

    btnSend.onclick = () => {

      // se estiver preview → envia áudio
      if (document.querySelector('.audio-preview')) {
        if (!audioChunks.length) return;

        const blob = new Blob(audioChunks, { 
          type: mediaRecorder?.mimeType || 'audio/webm' 
        });

        sendAudioDirect(blob);
        resetPreviewUI();
        return;
      }

      // se estiver gravando travado
      if (window.__recordState?.isRecording && window.__recordState?.isLocked) {
        finishRecording(true);
        return;
      }

      doSend();
    };

    chatText.addEventListener('keydown', e => {

      if (e.key === 'Enter') {

        e.preventDefault();

        doSend();

      }

    });

    // envia evento informando que o usuário está digitando
    function debounce(fn, delay) {
      let timeout;
      return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
      };
    }

    const emitTyping = debounce(() => {
      if (conversationId) {
        socket.emit('typing', { conversationId });
      }
    }, 400);

    chatText.addEventListener('input', emitTyping);

    // abre ou fecha menu de anexos

    btnUpload.onclick = (e) => {

      e.stopPropagation();

      const isOpen = !attachmentMenu.hidden;

      attachmentMenu.hidden = isOpen;

    };

    document.addEventListener('click', (e) => {

      if (!attachmentMenu) return;

      if (!attachmentMenu.contains(e.target) && e.target !== btnUpload) {
        attachmentMenu.hidden = true;
      }

    });

    // abrir galeria

    btnSendImage.onclick = () => {

      attachmentMenu.hidden = true;

      chatFileInput.click();

    };

    // abrir câmera 

    btnSendCamera.onclick = () => {

      attachmentMenu.hidden = true;

      chatFileInput.setAttribute('capture','environment');

      chatFileInput.click();

    };

    // enviar localização 

    btnSendLocation.onclick = () => {

      attachmentMenu.hidden = true;

      openLocationPicker();

    };

    // quando escolhe imagem

    chatFileInput.addEventListener('change', previewAndSendImage);

    /* expõe para fora (uso no btnSend) */
    window.__recordState = {
      get isRecording(){ return isRecording; },
      get isLocked(){ return isLocked; }
    };

    if (btnRecord) {

      btnRecord.addEventListener('mousedown', startRecording);

      btnRecord.addEventListener('touchstart', e => {
        e.preventDefault();
        startRecording(e);
      });

      btnRecord.addEventListener('touchend', () => {
        isPressing = false;

        clearTimeout(holdTimeout);
        holdTimeout = null;

        if (!mediaRecorder) return;

        if (!isLocked) {
          recordAction = 'send';
          finishRecording(true);
        }
      });

      btnRecord.addEventListener('mouseup', () => {
        isPressing = false;

        clearTimeout(holdTimeout);
        holdTimeout = null;

        if (!mediaRecorder) return;

        if (!isLocked) {
          recordAction = 'send';
          finishRecording(true); // envia direto
        }
      });

    }
  }

  // iniciar gravação

  async function startRecording(e) {

    audioChunks = [];
    pausedTime = 0;

    console.log('PRESSIONOU MICROFONE');

    clearTimeout(holdTimeout);
    holdTimeout = null;

    if (isRecording) return;

    isPressing = true;

    const touch = e.touches ? e.touches[0] : e;

    startX = touch.clientX;
    startY = touch.clientY;

    holdTimeout = setTimeout(async () => {

      if (!isPressing || isRecording) return;

      console.log('COMEÇOU GRAVAÇÃO');

      /* valida suporte */
      if (!navigator.mediaDevices || !window.MediaRecorder) {
        alert('Seu navegador não suporta gravação de áudio');
        return;
      }

      try {

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        const mimeType = MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';

        mediaRecorder = new MediaRecorder(stream, { mimeType });

        audioChunks = [];

        mediaRecorder.ondataavailable = ev => audioChunks.push(ev.data);

        mediaRecorder.onstop = handleStop;

        mediaRecorder.onstart = () => {
          isRecording = true;
          startTimer();

          document.getElementById('recordingLock')?.classList.add('visible');
        };

        /* estado inicial */
        const lockEl = document.getElementById('recordingLock');
        lockEl?.classList.remove('locked');

        isLocked = false;

        recordingStartTime = performance.now();

        /* UI */
        const inputArea = document.querySelector('.chat-input');
        inputArea.classList.add('recording-active');
        btnRecord.classList.add('recording-active');

        /* esconde só o necessário */
        document.getElementById('chatText').style.opacity = '0';
        document.getElementById('chatText').style.pointerEvents = 'none';

        document.getElementById('btnUpload').style.opacity = '0';
        document.getElementById('btnUpload').style.pointerEvents = 'none';

        document.getElementById('btnSend').style.display = 'inline-flex';
        document.getElementById('recordingOverlay').style.display = 'flex';

        document.getElementById('recordingTimerText').textContent = '0:00';

        /* INICIA GRAVAÇÃO */
        mediaRecorder.start();

      } catch (err) {

        console.error(err);

        alert('Permissão de microfone negada ou erro ao iniciar gravação');

        isPressing = false;
        isRecording = false;

        resetRecordingUI();
      }
      
    }, 300);
  }

  async function handleStop() {

    try {

      if (!audioChunks.length) {
        console.warn('Áudio vazio');
        resetRecordingUI();
        return;
      }

      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });

      if (recordAction === 'cancel') {
        audioChunks = [];
        resetRecordingUI();
        return;
      }

      if (recordAction === 'preview') {
        showAudioPreview(blob);
        return;
      }

      // padrão = enviar
      await sendAudioDirect(blob);

    } catch (err) {
      console.error(err);
    }

    resetRecordingUI();
    mediaRecorder = null;
  }

  // parar e enviar

  function stopRecording() {

    clearTimeout(holdTimeout);
    holdTimeout = null;

    isPressing = false;

    if (!mediaRecorder) return;

    if (!isLocked) {
      finishRecording(true);
    }
  }

  // cancelar gravação

  function cancelRecording() {

    clearTimeout(holdTimeout);
    holdTimeout = null;

    if (!isRecording) return;

    if (mediaRecorder) {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(t => t.stop());
    }

    isRecording = false;
    isLocked = false;
    isPressing = false;

    stopTimer();

    audioChunks = [];

    document.querySelector('.chat-input').classList.remove('recording-active');
    btnRecord.classList.remove('recording-active');
    document.getElementById('recordingOverlay').style.display = 'none';

    const lockEl = document.getElementById('recordingLock');

    if (lockEl) {
      lockEl.classList.remove('locked');
      lockEl.classList.remove('visible');
      lockEl.classList.remove('active');
    }

    /* volta UI normal */
    document.getElementById('btnSend').style.display = 'inline-flex';
    
    const btnUpload = document.getElementById('btnUpload');
    btnUpload.style.opacity = '1';
    btnUpload.style.pointerEvents = 'auto';
    
    document.getElementById('chatText').style.opacity = '1';
    document.getElementById('chatText').style.pointerEvents = 'auto';

  }

  // envia direto sem preview

  async function sendAudioDirect(blob) {

    if (!blob) return;

    const form = new FormData();

    form.append('audio', blob);
    form.append('animal_id', animalId);
    form.append('to_user_id', toUserId);

    const res = await fetch(`${API_BASE}/chat/messages/audio`, {
      method: 'POST',
      headers: {
        'x-user-id': String(myId)
      },
      body: form
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(data.error || 'Erro ao enviar áudio.');
      return;
    }

    conversationId = data.conversation_id;

    socket.emit('join', { conversationId });

    socket.emit('send_message', {
      conversationId,
      message: data.message
    });

  }

  /* timer da gravação */

  function startTimer() {

    recordingTimer = setInterval(() => {

      const diff = Math.floor((performance.now() - recordingStartTime - pausedTime) / 1000);

      const min = Math.floor(diff / 60);
      const sec = String(diff % 60).padStart(2, '0');

      const el = document.getElementById('recordingTimerText');

      if (el) {
        el.textContent = `${min}:${sec}`;
      }

    }, 250);

  }

  function stopTimer() {

    clearInterval(recordingTimer);

    const el = document.getElementById('recordingTimerText');

    if (el) {
      el.textContent = '0:00';
    }

  }

  /* detectar gesto */

  document.addEventListener('mousemove', handleMove);
  document.addEventListener('touchmove', handleMove);

  function handleMove(e) {

    if (!isRecording) return;

    const touch = e.touches ? e.touches[0] : e;

    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;

    const cancelEl = document.getElementById('recordingCancel');
    const lockEl = document.getElementById('recordingLock');

    /* TRAVAR (arrastar pra cima) */
    if (dy < -60 && Math.abs(dx) < 50 && !isLocked) {

      isLocked = true;

      lockEl?.classList.add('locked');

      document.getElementById('recordingCancel').style.display = 'none';

      showLockedControls();

      return;
    }

    /* CANCELAR (arrastar pra esquerda) */
    if (dx < -120 && Math.abs(dy) < 80 && !isLocked) {

      recordAction = 'cancel';
      cancelRecording();
      return;
    }

    /* feedback visual */
    cancelEl?.classList.toggle('active', dx < -40);
    lockEl?.classList.toggle('active', dy < -40);
  }

  function showLockedControls() {

    let controls = document.getElementById('lockedControls');

    if (controls) return;

    controls = document.createElement('div');
    controls.id = 'lockedControls';
    controls.className = 'locked-controls';

    /* cria botão deletar */

    const btnDelete = document.createElement('button');
    btnDelete.id = 'btnDeleteAudio';
    btnDelete.innerHTML = '<i class="fa-solid fa-trash"></i>';

    const btnPause = document.createElement('button');
    btnPause.id = 'btnPauseAudio';
    btnPause.innerHTML = '<i class="fa-solid fa-pause"></i>';

    controls.appendChild(btnDelete);
    controls.appendChild(btnPause);

    /* posiciona ao lado do botão enviar (lado direito) */

    const inputArea = document.querySelector('.chat-input');
    inputArea.style.position = 'relative';
    const btnSend = document.getElementById('btnSend')

    inputArea.appendChild(controls);

    controls.style.display = 'flex';
    controls.style.gap = '8px';
    controls.style.pointerEvents = 'auto';

    /* botão deletar */

    btnDelete.onclick = () => {
      recordAction = 'cancel';
      cancelRecording();
      controls.remove();
    };

    /* botão pause / resume */

    btnPause.onclick = () => {

      if (!mediaRecorder) return;

      // AO CLICAR → FINALIZA E VAI PRA PREVIEW
      recordAction = 'preview';

      finishRecording(false); // 👈 ESSENCIAL

    };

  }

  function finishRecording(send = true) {

    if (!mediaRecorder) return;

    recordAction = send ? 'send' : 'preview';

    mediaRecorder.stop();

    if (mediaRecorder.stream) {
      mediaRecorder.stream.getTracks().forEach(t => t.stop());
    }
  }

  function resetRecordingUI() {

    stopTimer();

    const controls = document.getElementById('lockedControls');
    if (controls) controls.remove();

    document.getElementById('recordingOverlay').style.display = 'flex';

    document.querySelector('.chat-input').classList.remove('recording-active');
    btnRecord.classList.remove('recording-active');

    document.getElementById('recordingOverlay').style.display = 'none';

    document.getElementById('recordingLock')?.classList.remove('locked');
    document.getElementById('recordingLock')?.classList.remove('visible');

    document.getElementById('btnSend').style.display = 'inline-flex';

    document.getElementById('chatText').style.opacity = '1';
    document.getElementById('chatText').style.pointerEvents = 'auto';

    document.getElementById('btnUpload').style.opacity = '1';
    document.getElementById('btnUpload').style.pointerEvents = 'auto';

    document.getElementById('btnRecord').style.display = 'inline-flex';

    document.getElementById('recordingCancel').style.display = 'flex';

    isRecording = false;
    isLocked = false;
    isPressing = false;
  }

  /* contexto do chat */

  async function loadChatContext() {

    try {

      const animalRes = await fetch(`${API_BASE}/animals/${animalId}`);

      const animal = await animalRes.json();

      chatAnimalName.textContent =
        `${animal.name} - ${animal.species || ''}`;

      chatAnimalPhoto.src =
        `${API_BASE}/uploads/animals/${animal.photo}`;

      const userRes = await fetch(`${API_BASE}/users/${toUserId}`);

      const user = await userRes.json();

      chatWithUser.textContent =
        `Conversando com ${user.name}`;

    }

    catch (err) {

      console.error(err);

    }

  }

  /* fechar modal */

  if (closeImageModal) {

    closeImageModal.onclick = () => {

      imageModal.style.display = "none";

    };

  }

  if (imageModal) {

    imageModal.onclick = e => {

      if (e.target === imageModal) {

        imageModal.style.display = "none";

      }

    };

  }

  /* confirmar envio */
  confirmLocation.onclick = async ()=>{

    const link = `https://maps.google.com/?q=${selectedLat},${selectedLng}`;

    await sendMessage(link);

    locationSheet.hidden = true;

  };

  cancelLocation.onclick = ()=>{

    locationSheet.hidden = true;

  };

  start();

  /* renderiza mapas nas mensagens */

  function renderLocationMaps() {

    const maps = document.querySelectorAll('.message-location');

    maps.forEach(el => {

      if (el.dataset.loaded) return;

      const lat = parseFloat(el.dataset.lat);
      const lng = parseFloat(el.dataset.lng);

      if (isNaN(lat) || isNaN(lng)) return;

      const mapEl = el.querySelector('.location-map');
      const addressEl = el.querySelector('.location-address');
      const linkEl = el.querySelector('.location-open');

      if (!window.google || !google.maps) {
        console.warn('Google Maps não carregado');
        return;
      }

      // cria mini mapa
      const miniMap = new google.maps.Map(mapEl, {
        center: { lat, lng },
        zoom: 15,
        disableDefaultUI: true,
        gestureHandling: 'none'
      });

      // marcador
      new google.maps.Marker({
        position: { lat, lng },
        map: miniMap
      });

      // link para abrir no maps
      if (linkEl) {
        linkEl.href = `https://maps.google.com/?q=${lat},${lng}`;
      }

      // busca endereço (reverse geocoding)
      if (addressEl && window.google?.maps?.Geocoder) {

        const geocoder = new google.maps.Geocoder();

        geocoder.geocode(
          { location: { lat, lng } },
          (results, status) => {

            if (status === 'OK' && results[0]) {
              addressEl.textContent = results[0].formatted_address;
            } else {
              addressEl.textContent = 'Endereço não encontrado';
            }

          }
        );
      }

      el.dataset.loaded = "1";

      // abre mapa grande ao clicar
      el.addEventListener('click', () => {
        openFullMap(lat, lng);
      });

    });
  }

  /* mapa tela cheia */

  function openFullMap(lat, lng) {

    const modal = document.createElement('div');
    modal.className = 'map-modal';

    modal.innerHTML = `
      <span class="map-modal-close">&times;</span>

      <div class="map-modal-box">
        <div id="fullMap"></div>
      </div>
    `;

    // fechar ao clicar fora
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });

    document.body.appendChild(modal);

    const map = new google.maps.Map(
      document.getElementById('fullMap'),
      {
        center: { lat, lng },
        zoom: 16
      }
    );

    new google.maps.Marker({
      position: { lat, lng },
      map
    });

    // botão fechar (X)
    modal.querySelector('.map-modal-close').onclick = () => {
      modal.remove();
    };

  }

  /* preview de áudio antes de enviar */

  function showAudioPreview(blob) {

    const url = URL.createObjectURL(blob);

    const inputArea = document.querySelector('.chat-input');

    // remove preview antigo
    const old = inputArea.querySelector('.audio-preview');
    if (old) {
      const oldAudio = old.querySelector('audio');
      if (oldAudio) URL.revokeObjectURL(oldAudio.src);
      old.remove();
    }

    // remove controles travados
    const controls = document.getElementById('lockedControls');
    if (controls) controls.remove();

    /* CONTAINER PRINCIPAL */
    const container = document.createElement('div');
    container.className = 'audio-preview';

    /* BOTÃO LIXEIRA (IGUAL AO TRAVADO) */
    const btnDelete = document.createElement('button');
    btnDelete.innerHTML = '<i class="fa-solid fa-trash"></i>';

    btnDelete.onclick = () => {
      URL.revokeObjectURL(audio.src);
      resetPreviewUI();
    };

    /* AUDIO */
    const audio = document.createElement('audio');
    audio.src = url;
    audio.controls = true;

    container.appendChild(btnDelete);
    container.appendChild(audio);

    /* INSERE NO LUGAR DO INPUT */
    chatText.style.display = 'none';
    chatText.style.pointerEvents = 'none';
    inputArea.insertBefore(container, chatText);

    /* ESCONDE SEM QUEBRAR LAYOUT */
    btnUpload.style.opacity = '0';
    btnUpload.style.pointerEvents = 'none';

    btnRecord.style.opacity = '0';
    btnRecord.style.pointerEvents = 'none';

    btnSend.style.display = 'inline-flex';
  
  }

  function resetPreviewUI() {

    const preview = document.querySelector('.audio-preview');

    if (preview) {
      const audio = preview.querySelector('audio');
      if (audio) URL.revokeObjectURL(audio.src);
      preview.remove();
    }

    audioChunks = [];

    /* RESTAURA INPUT */
    chatText.style.display = 'block';
    chatText.style.visibility = 'visible';
    chatText.style.opacity = '1';
    chatText.style.pointerEvents = 'auto';

    btnUpload.style.display = 'inline-flex';
    btnUpload.style.opacity = '1';
    btnUpload.style.pointerEvents = 'auto';

    btnRecord.style.display = 'inline-flex';
    btnRecord.style.opacity = '1';
    btnRecord.style.pointerEvents = 'auto';

    btnSend.style.display = 'inline-flex';

    resetRecordingUI();
  }

})();