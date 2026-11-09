/**
 * Arquivo: upload.js
 * Descrição: Configuração do Multer para upload de imagens
 * Projeto: BuscaPet
 */

'use strict';

const multer = require('multer');
const path = require('path');

// Configuração de armazenamento
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.resolve(__dirname, '..', 'uploads', 'animals'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `animal-${Date.now()}${ext}`;
    cb(null, filename);
  }
});

// Filtro para aceitar apenas imagens
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Arquivo inválido. Envie apenas imagens.'));
  }
};

const upload = multer({
  storage,
  fileFilter
});

module.exports = upload;
