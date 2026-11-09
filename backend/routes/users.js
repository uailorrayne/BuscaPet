/**
 * Arquivo: users.js
 * Descrição: Rotas de usuário (perfil)
 * Projeto: BuscaPet
 */

'use strict';

const express = require('express');
const pool = require('../database.js');
const uploadAvatar = require('../config/uploadAvatar');
const fs = require('fs');
const path = require('path');

const router = express.Router();

function canEditUser(req, userIdParam) {
  const headerId = req.headers['x-user-id'];
  if (!headerId) return false;
  return String(headerId) === String(userIdParam);
}

function withAvatarUrl(req, userRow) {
  const base = `${req.protocol}://${req.get('host')}`;
  const avatar_url = userRow.avatar ? `${base}/uploads/avatars/${userRow.avatar}` : null;
  return { ...userRow, avatar_url };
}

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT id, name, username, email, avatar
       FROM users
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    return res.json(withAvatarUrl(req, result.rows[0]));
  } catch (error) {
    console.error('Erro em GET /users/:id:', error?.message, error);
    return res.status(500).json({ error: 'Erro ao buscar usuário' });
  }
});

router.put('/:id', uploadAvatar.single('avatar'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!canEditUser(req, id)) {
      return res.status(403).json({ error: 'Sem permissão para editar este perfil.' });
    }

    const name = String(req.body.name || '').trim();
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim();

    const avatarFilename = req.file ? req.file.filename : null;

    const current = await pool.query(
      `SELECT id, name, username, email, avatar
       FROM users
       WHERE id = $1`,
      [id]
    );

    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const cur = current.rows[0];

    const nextName = name || cur.name;
    const nextUsername = username || cur.username;
    const nextEmail = email || cur.email;
    const nextAvatar = avatarFilename ? avatarFilename : cur.avatar;

    if (nextUsername) {
      const u = await pool.query(
        `SELECT id FROM users WHERE username = $1 AND id <> $2`,
        [nextUsername, id]
      );
      if (u.rows.length > 0) return res.status(409).json({ error: 'Esse username já está em uso.' });
    }

    if (nextEmail) {
      const e = await pool.query(
        `SELECT id FROM users WHERE email = $1 AND id <> $2`,
        [nextEmail, id]
      );
      if (e.rows.length > 0) return res.status(409).json({ error: 'Esse e-mail já está em uso.' });
    }

    const updated = await pool.query(
      `UPDATE users
       SET name = $1, username = $2, email = $3, avatar = $4
       WHERE id = $5
       RETURNING id, name, username, email, avatar`,
      [nextName, nextUsername, nextEmail, nextAvatar, id]
    );

    // se trocou avatar, tenta apagar o antigo
    if (avatarFilename && cur.avatar && cur.avatar !== avatarFilename) {
      const oldPath = path.resolve(__dirname, '..', 'uploads', 'avatars', cur.avatar);
      fs.unlink(oldPath, () => {});
    }

    return res.json({
      message: 'Perfil atualizado com sucesso',
      user: withAvatarUrl(req, updated.rows[0])
    });
  } catch (error) {
    console.error('Erro em PUT /users/:id:', error?.message, error);
    return res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
});

/**
 * DELETE /users/:id
 * Exclui conta (e avatar)
 * Header obrigatório: x-user-id
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!canEditUser(req, id)) {
      return res.status(403).json({ error: 'Sem permissão para excluir esta conta.' });
    }

    const current = await pool.query(`SELECT id, avatar FROM users WHERE id = $1`, [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // OBS: aqui NÃO apaga animais automaticamente (pra não quebrar FK sem você querer).
    // Se seu banco tem FK animals.user_id -> users.id, você precisa decidir:
    // - OU apagar os animais desse usuário antes
    // - OU alterar a FK pra ON DELETE CASCADE
    const hasAnimals = await pool.query(`SELECT id FROM animals WHERE user_id = $1 LIMIT 1`, [id]);
    if (hasAnimals.rows.length > 0) {
      return res.status(409).json({
        error: 'Você ainda tem animais cadastrados. Exclua seus animais antes de excluir a conta.'
      });
    }

    await pool.query(`DELETE FROM users WHERE id = $1`, [id]);

    const avatar = current.rows[0].avatar;
    if (avatar) {
      const avatarPath = path.resolve(__dirname, '..', 'uploads', 'avatars', avatar);
      fs.unlink(avatarPath, () => {});
    }

    return res.json({ message: 'Conta excluída com sucesso' });
  } catch (error) {
    console.error('Erro em DELETE /users/:id:', error?.message, error);
    return res.status(500).json({ error: 'Erro ao excluir conta' });
  }
});

module.exports = router;
