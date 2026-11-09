/**
 * Arquivo: navigation.js
 * Descrição: Funções de navegação (voltar) do app
 * Projeto: BuscaPet
 */

'use strict';

/**
 * Volta para a página anterior.
 * Se não houver histórico (ex: abriu link direto), vai para a Home.
 */
function goBack(fallback = 'home.html') {
  if (window.history.length > 1) {
    window.history.back();
    return;
  }

  window.location.href = fallback;
}
