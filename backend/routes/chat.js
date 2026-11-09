'use strict';

const express = require('express');
const pool = require('../database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

function getRequesterUserId(req) {
  return req.headers['x-user-id'] ? String(req.headers['x-user-id']) : '';
}

function pairIds(a, b) {
  const x = Number(a);
  const y = Number(b);
  return x < y ? { low: x, high: y } : { low: y, high: x };
}

// Storage para áudios de chat
const audioStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.resolve(__dirname, '..', 'uploads', 'chat-audio');
    fs.mkdir(dir, { recursive: true }, (err) => {
      cb(err, dir);
    });
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.webm';
    const name = `chat-${Date.now()}-${Math.random().toString(36).slice(2)}.webm`;
    cb(null, name);
  }
});

const audioFileFilter = (req, file, cb) => {
  if (file.mimetype && file.mimetype.startsWith('audio/')) {
    cb(null, true);
  } else {
    cb(new Error('Arquivo de áudio inválido.'), false);
  }
};

const uploadAudio = multer({ storage: audioStorage, fileFilter: audioFileFilter });

// Storage para imagens do chat
const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.resolve(__dirname, '..', 'uploads', 'chat-images');
    fs.mkdir(dir, { recursive: true }, (err) => {
      cb(err, dir);
    });
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const name = `chat-img-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, name);
  }
});

const imageFileFilter = (req, file, cb) => {
  if (file.mimetype && file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Arquivo de imagem inválido.'), false);
  }
};

/* Upload de imagens do chat */
const uploadImage = multer({
  storage: imageStorage,
  fileFilter: imageFileFilter
});

/**
 * GET /chat/conversations
 * Lista conversas do usuário logado
 * Apenas conversas que possuem mensagens
 * Retorna contador de não lidas
 */
router.get('/conversations', async (req, res) => {
  try {
    const me = getRequesterUserId(req);
    if (!me) return res.status(401).json({ error: 'Cabeçalho x-user-id não enviado.' });

    const out = await pool.query(
      `
      SELECT
        c.id,
        c.animal_id,
        c.last_message_at,
        a.name AS animal_name,
        a.photo AS animal_photo,
        CASE WHEN c.user_low_id = $1 THEN c.user_high_id ELSE c.user_low_id END AS other_user_id,
        u.name AS other_user_name,
        CASE 
          WHEN c.user_low_id = $1 THEN c.unread_low
          ELSE c.unread_high
        END AS unread_count
      FROM conversations c
      JOIN animals a ON a.id = c.animal_id
      JOIN users u ON u.id = CASE WHEN c.user_low_id = $1 THEN c.user_high_id ELSE c.user_low_id END
      WHERE 
        (c.user_low_id = $1 OR c.user_high_id = $1)
        AND c.last_message_at IS NOT NULL
      ORDER BY c.last_message_at DESC
      `,
      [Number(me)]
    );

    return res.json(out.rows);

  } catch (e) {
    console.error('GET /chat/conversations erro:', e);
    return res.status(500).json({ error: 'Erro ao listar conversas.' });
  }
});

/**
 * GET /chat/messages/:conversationId
 */
router.get('/messages/:conversationId', async (req, res) => {
  try {
    const me = getRequesterUserId(req);
    if (!me) return res.status(401).json({ error: 'Cabeçalho x-user-id não enviado.' });

    const conversationId = Number(req.params.conversationId);
    if (!conversationId) return res.status(400).json({ error: 'conversationId inválido.' });

    const can = await pool.query(
      `SELECT id FROM conversations
       WHERE id = $1 AND (user_low_id = $2 OR user_high_id = $2)`,
      [conversationId, Number(me)]
    );
    if (can.rows.length === 0) return res.status(403).json({ error: 'Sem permissão.' });

    const msgs = await pool.query(
      `SELECT id, sender_id, text, audio_url, created_at
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC, id ASC`,
      [conversationId]
    );

    return res.json(msgs.rows);

  } catch (e) {
    console.error('GET /chat/messages erro:', e);
    return res.status(500).json({ error: 'Erro ao listar mensagens.' });
  }
});

/**
 * PUT /chat/conversations/:conversationId/read
 * Zera contador de mensagens não lidas do usuário logado
 */
router.put('/conversations/:conversationId/read', async (req, res) => {
  try {
    const me = getRequesterUserId(req);
    if (!me) return res.status(401).json({ error: 'Cabeçalho x-user-id não enviado.' });

    const conversationId = Number(req.params.conversationId);

    const conv = await pool.query(
      `SELECT user_low_id, user_high_id FROM conversations WHERE id = $1`,
      [conversationId]
    );

    if (conv.rows.length === 0) return res.status(404).json({ error: 'Conversa não encontrada.' });

    const { user_low_id, user_high_id } = conv.rows[0];

    if (Number(me) === user_low_id) {
      await pool.query(
        `UPDATE conversations SET unread_low = 0 WHERE id = $1`,
        [conversationId]
      );
    } else if (Number(me) === user_high_id) {
      await pool.query(
        `UPDATE conversations SET unread_high = 0 WHERE id = $1`,
        [conversationId]
      );
    }

    return res.json({ success: true });

  } catch (e) {
    console.error('PUT /chat/conversations/read erro:', e);
    return res.status(500).json({ error: 'Erro ao atualizar leitura.' });
  }
});

/**
 * POST /chat/messages
 * body: { animal_id, to_user_id, text }
 * Cria conversa se não existir e envia mensagem
 */
router.post('/messages', async (req, res) => {
  try {
    const me = getRequesterUserId(req);
    if (!me) return res.status(401).json({ error: 'Cabeçalho x-user-id não enviado.' });

    const animalId = Number(req.body.animal_id);
    const toUserId = Number(req.body.to_user_id);
    const text = String(req.body.text || '').trim();

    if (!animalId || !toUserId) return res.status(400).json({ error: 'animal_id e to_user_id são obrigatórios.' });
    if (!text) return res.status(400).json({ error: 'Mensagem vazia.' });

    const { low, high } = pairIds(me, toUserId);

    // verifica se já existe conversa
    let conv = await pool.query(
      `SELECT id, user_low_id, user_high_id FROM conversations
       WHERE animal_id = $1 AND user_low_id = $2 AND user_high_id = $3`,
      [animalId, low, high]
    );

    let conversationId;

    if (conv.rows.length === 0) {
      const created = await pool.query(
        `INSERT INTO conversations (animal_id, user_low_id, user_high_id)
         VALUES ($1,$2,$3)
         RETURNING id, user_low_id, user_high_id`,
        [animalId, low, high]
      );
      conv = created;
    }

    conversationId = conv.rows[0].id;

    const inserted = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, text)
       VALUES ($1,$2,$3)
       RETURNING id, sender_id, text, audio_url, created_at`,
      [conversationId, Number(me), text]
    );

    await pool.query(
      `UPDATE conversations
       SET last_message_at = NOW(),
           unread_low = CASE WHEN $2 = user_low_id THEN unread_low ELSE unread_low + 1 END,
           unread_high = CASE WHEN $2 = user_high_id THEN unread_high ELSE unread_high + 1 END
       WHERE id = $1`,
      [conversationId, Number(me)]
    );

    return res.status(201).json({
      conversation_id: conversationId,
      message: inserted.rows[0]
    });

  } catch (e) {
    console.error('POST /chat/messages erro:', e);
    return res.status(500).json({ error: 'Erro ao enviar mensagem.' });
  }
});

/**
 * POST /chat/messages/audio
 * Envia mensagem de áudio (estilo WhatsApp)
 * form-data: audio (file), animal_id, to_user_id
 */

router.post('/messages/audio', uploadAudio.single('audio'), async (req, res) => {
  try {
    const me = getRequesterUserId(req);
    if (!me) return res.status(401).json({ error: 'Cabeçalho x-user-id não enviado.' });

    const animalId = Number(req.body.animal_id);
    const toUserId = Number(req.body.to_user_id);

    if (!animalId || !toUserId) {
      return res.status(400).json({ error: 'animal_id e to_user_id são obrigatórios.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo de áudio é obrigatório.' });
    }

    const { low, high } = pairIds(me, toUserId);

    // verifica se já existe conversa
    let conv = await pool.query(
      `SELECT id, user_low_id, user_high_id FROM conversations
       WHERE animal_id = $1 AND user_low_id = $2 AND user_high_id = $3`,
      [animalId, low, high]
    );

    let conversationId;

    if (conv.rows.length === 0) {
      const created = await pool.query(
        `INSERT INTO conversations (animal_id, user_low_id, user_high_id)
         VALUES ($1,$2,$3)
         RETURNING id, user_low_id, user_high_id`,
        [animalId, low, high]
      );
      conv = created;
    }

    conversationId = conv.rows[0].id;

    const audioUrl = `/uploads/chat-audio/${req.file.filename}`;

    const inserted = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, text, audio_url)
       VALUES ($1,$2,$3,$4)
       RETURNING id, sender_id, text, audio_url, created_at`,
      [conversationId, Number(me), '', audioUrl]
    );

    await pool.query(
      `UPDATE conversations
       SET last_message_at = NOW(),
           unread_low = CASE WHEN $2 = user_low_id THEN unread_low ELSE unread_low + 1 END,
           unread_high = CASE WHEN $2 = user_high_id THEN unread_high ELSE unread_high + 1 END
       WHERE id = $1`,
      [conversationId, Number(me)]
    );

    return res.status(201).json({
      conversation_id: conversationId,
      message: inserted.rows[0]
    });

  } catch (e) {
    console.error('POST /chat/messages/audio erro:', e);
    return res.status(500).json({ error: 'Erro ao enviar áudio.' });
  }
});

/**
 * POST /chat/messages/image
 * Envia imagem no chat
 * form-data: image (file), animal_id, to_user_id
 */

router.post('/messages/image', uploadImage.single('image'), async (req, res) => {
  try {
    const me = getRequesterUserId(req);
    if (!me) return res.status(401).json({ error: 'Cabeçalho x-user-id não enviado.' });

    const animalId = Number(req.body.animal_id);
    const toUserId = Number(req.body.to_user_id);

    if (!animalId || !toUserId) {
      return res.status(400).json({ error: 'animal_id e to_user_id são obrigatórios.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo de imagem é obrigatório.' });
    }

    const { low, high } = pairIds(me, toUserId);

    let conv = await pool.query(
      `SELECT id FROM conversations
       WHERE animal_id = $1 AND user_low_id = $2 AND user_high_id = $3`,
      [animalId, low, high]
    );

    if (conv.rows.length === 0) {
      const created = await pool.query(
        `INSERT INTO conversations (animal_id, user_low_id, user_high_id)
         VALUES ($1,$2,$3)
         RETURNING id`,
        [animalId, low, high]
      );
      conv = created;
    }

    const conversationId = conv.rows[0].id;

    const imageUrl = `/uploads/chat-images/${req.file.filename}`;

    const inserted = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, text)
       VALUES ($1,$2,$3)
       RETURNING id, sender_id, text, audio_url, created_at`,
      [conversationId, Number(me), imageUrl]
    );

    await pool.query(
      `UPDATE conversations
       SET last_message_at = NOW(),
           unread_low = CASE WHEN $2 = user_low_id THEN unread_low ELSE unread_low + 1 END,
           unread_high = CASE WHEN $2 = user_high_id THEN unread_high ELSE unread_high + 1 END
       WHERE id = $1`,
      [conversationId, Number(me)]
    );

    return res.status(201).json({
      conversation_id: conversationId,
      message: inserted.rows[0]
    });

  } catch (e) {
    console.error('POST /chat/messages/image erro:', e);
    return res.status(500).json({ error: 'Erro ao enviar imagem.' });
  }
});

module.exports = router;