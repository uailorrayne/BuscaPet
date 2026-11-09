/**
 * Arquivo: uploadAvatar.js
 * Descrição: Configuração do Multer para upload do avatar do usuário
 * Projeto: BuscaPet
 */

'use strict';

const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.resolve(__dirname, '..', 'uploads', 'avatars'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `avatar-${Date.now()}${ext}`;
    cb(null, filename);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype && file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Arquivo inválido. Envie apenas imagens.'));
  }
};

module.exports = multer({ storage, fileFilter });
