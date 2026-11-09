/**
 * Arquivo: auth.js
 * Descrição: Rotas de autenticação do usuário (backend)
 * Projeto: BuscaPet
 */

'use strict';

const express = require('express');
const pool = require('../database.js');

const router = express.Router();

/**
 * Rota de cadastro
 * POST /auth/register
 */
router.post('/register', async (req, res) => {
  try {
    const { fullName, username, email, password } = req.body;

    console.log('BODY REGISTER:', req.body);

    if (!fullName || !username || !email || !password) {
      return res.status(400).json({ error: 'Preencha todos os campos.' });
    }

    const exists = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );

    if (exists.rows.length > 0) {
      return res.status(409).json({ error: 'E-mail ou username já cadastrado.' });
    }

    const result = await pool.query(
      `INSERT INTO users (name, username, email, password)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [fullName, username, email, password]
    );

    return res.status(201).json({
      message: 'Conta criada com sucesso!',
      user_id: result.rows[0].id
    });

  } catch (error) {
    console.error('Erro no register:', error.message, error);
    return res.status(500).json({ error: 'Erro ao criar conta' });
  }
});

/**
 * Rota de login
 * POST /auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Preencha e-mail e senha.' });
    }

    const result = await pool.query(
      'SELECT id, password FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }

    const user = result.rows[0];

    if (user.password !== password) {
      return res.status(401).json({ error: 'Senha incorreta' });
    }

    return res.json({
      message: 'Login realizado com sucesso',
      user_id: user.id
    });

  } catch (error) {
    console.error('Erro no login:', error.message, error);
    return res.status(500).json({ error: 'Erro no login' });
  }
});

module.exports = router;
