/**
 * Arquivo: config.js
 * Descrição: Configurações globais do frontend (evita redeclaração).
 * Projeto: BuscaPet
 */
'use strict';

window.APP_CONFIG = {
  API_BASE: 'http://localhost:3000',
  MAP_ID: 'cb4cbc22abe73b57184a9e8c'
};

window.getUserId = function () {
  return localStorage.getItem('user_id') || '';
};
