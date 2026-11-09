/**
 * Arquivo: auth.js
 * Descrição: Funções de autenticação do usuário (frontend)
 * Projeto: BuscaPet
 */

'use strict';

const AUTH_API = 'http://localhost:3000/auth';

async function login() {
  const email = document.getElementById('email')?.value?.trim();
  const password = document.getElementById('password')?.value;

  if (!email || !password) {
    alert('Preencha e-mail e senha.');
    return;
  }

  try {
    const response = await fetch(`${AUTH_API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      alert(data.error || 'Erro ao fazer login');
      return;
    }

    localStorage.setItem('user_id', data.user_id);
    alert(data.message || 'Login realizado com sucesso');
    window.location.href = 'home.html';

  } catch (error) {
    console.error('Erro no login:', error);
    alert('Erro ao realizar login');
  }
}

async function register() {
  const fullName = document.getElementById('fullName')?.value?.trim();
  const username = document.getElementById('username')?.value?.trim();
  const email = document.getElementById('email')?.value?.trim();
  const password = document.getElementById('password')?.value;

  if (!fullName || !username || !email || !password) {
    alert('Preencha todos os campos.');
    return;
  }

  try {
    const response = await fetch(`${AUTH_API}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, username, email, password })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      alert(data.error || 'Erro ao criar conta');
      return;
    }

    localStorage.setItem('user_id', data.user_id);
    alert(data.message || 'Conta criada com sucesso!');
    window.location.href = 'home.html';

  } catch (error) {
    console.error('Erro no register:', error);
    alert('Erro ao criar conta');
  }
}

function checkAuth() {
  const userId = localStorage.getItem('user_id');
  if (!userId) {
    alert('Você precisa estar logado para acessar esta página.');
    window.location.href = 'login.html';
  }
}

/**
 * Logout global (para botões HTML onclick="logout()")
 */
window.logout = function () {
  try {
    localStorage.removeItem('user_id');
    localStorage.removeItem('token'); // se você usa token em algum momento
    localStorage.removeItem('user');  // se você salva user em cache
  } catch (e) {
    console.warn('Erro limpando storage no logout:', e);
  }

  // manda pro login (ou home, se você preferir)
  window.location.href = 'login.html';
};