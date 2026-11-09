/**
 * Arquivo: animals.js
 * Descrição: Rotas relacionadas aos animais (com múltiplas fotos)
 * Projeto: BuscaPet
 */

'use strict';

const express = require('express');
const pool = require('../database.js');
const upload = require('../config/upload');

const router = express.Router();

function getRequesterUserId(req) {
  return req.headers['x-user-id'] ? String(req.headers['x-user-id']) : '';
}

async function assertAnimalOwner(req, res, animalId) {
  const requester = getRequesterUserId(req);
  if (!requester) {
    res.status(401).json({ error: 'Cabeçalho x-user-id não enviado.' });
    return null;
  }

  const r = await pool.query('SELECT id, user_id, photo FROM animals WHERE id = $1', [animalId]);
  if (r.rows.length === 0) {
    res.status(404).json({ error: 'Animal não encontrado' });
    return null;
  }

  const animal = r.rows[0];
  if (String(animal.user_id) !== requester) {
    res.status(403).json({ error: 'Sem permissão para editar este animal.' });
    return null;
  }

  return animal;
}

async function getAnimalWithPhotos(animalId) {
  const animalResult = await pool.query('SELECT * FROM animals WHERE id = $1', [animalId]);
  if (animalResult.rows.length === 0) return null;

  const animal = animalResult.rows[0];

  let photosResult;
  try {
    photosResult = await pool.query(
      `SELECT filename
       FROM animal_photos
       WHERE animal_id = $1
       ORDER BY position ASC, id ASC`,
      [animalId]
    );
  } catch {
    photosResult = await pool.query(
      `SELECT filename
       FROM animal_photos
       WHERE animal_id = $1
       ORDER BY id ASC`,
      [animalId]
    );
  }

  animal.photos = photosResult.rows.map(r => r.filename);
  return animal;
}

/* Cadastrar novo animal (1..6 fotos obrigatórias) */
router.post('/', upload.array('photos', 6), async (req, res) => {
  try {
    const { name, species, color, description, latitude, longitude, user_id, status_type } = req.body;

    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length < 1) return res.status(400).json({ error: 'Selecione pelo menos 1 foto do animal.' });
    if (files.length > 6) return res.status(400).json({ error: 'Máximo de 6 fotos.' });

    const mainPhoto = files[0].filename;

    const inserted = await pool.query(
      `INSERT INTO animals (name, species, color, description, photo, latitude, longitude, user_id, status_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [name, species, color, description, mainPhoto, latitude, longitude, user_id, status_type]
    );

    const animalId = inserted.rows[0].id;

    try {
      const values = [];
      const params = [];
      let p = 1;

      files.forEach((f, idx) => {
        values.push(`($${p++}, $${p++}, $${p++})`);
        params.push(animalId, f.filename, idx);
      });

      await pool.query(
        `INSERT INTO animal_photos (animal_id, filename, position)
         VALUES ${values.join(', ')}`,
        params
      );
    } catch {
      const values = [];
      const params = [];
      let p = 1;

      files.forEach((f) => {
        values.push(`($${p++}, $${p++})`);
        params.push(animalId, f.filename);
      });

      await pool.query(
        `INSERT INTO animal_photos (animal_id, filename)
         VALUES ${values.join(', ')}`,
        params
      );
    }

    return res.status(201).json({ message: 'Animal cadastrado com sucesso', id: animalId });
  } catch (error) {
    console.error('Erro ao cadastrar animal:', error?.message, error);
    return res.status(500).json({ error: 'Erro ao cadastrar animal' });
  }
});

/* GET /animals */
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;

    let query = 'SELECT * FROM animals';
    const params = [];

    if (status) {
      query += ' WHERE status = $1';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);

    return res.json(result.rows);
  } catch (error) {
    console.error('Erro ao listar animais:', error?.message, error);
    return res.status(500).json({ error: 'Erro ao listar animais' });
  }
});

/* GET /animals/:id */
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const animal = await getAnimalWithPhotos(id);
    if (!animal) return res.status(404).json({ error: 'Animal não encontrado' });
    return res.json(animal);
  } catch (error) {
    console.error('Erro ao buscar animal por ID:', error?.message, error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

/* PUT /animals/:id */
// Edita dados + adiciona fotos + remove fotos específicas
// Header obrigatório: x-user-id
// Body: multipart/form-data

// Campos:
// name/species/color/description (opcionais)
// photos (0..6) opcional (adiciona novas fotos)
// remove_photos (string JSON) opcional ex: ["a.jpg","b.jpg"]

// Regra: no final precisa ter pelo menos 1 foto.
router.put('/:id', upload.array('photos', 6), async (req, res) => {
  const { id } = req.params;

  try {
    const ownerAnimal = await assertAnimalOwner(req, res, id);
    if (!ownerAnimal) return;

    const name = String(req.body.name || '').trim();
    const species = String(req.body.species || '').trim();
    const color = String(req.body.color || '').trim();
    const description = String(req.body.description || '').trim();
    const status_type = String(req.body.status_type || '').trim();

    // remove_photos pode vir como JSON string
    let removePhotos = [];
    if (req.body.remove_photos) {
      try {
        const parsed = JSON.parse(req.body.remove_photos);
        if (Array.isArray(parsed)) removePhotos = parsed.map(String);
      } catch {
        // ignora se vier inválido
        removePhotos = [];
      }
    }

    // mantém o que não veio
    const current = await pool.query('SELECT * FROM animals WHERE id = $1', [id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Animal não encontrado' });
    const cur = current.rows[0];

    const nextName = name || cur.name;
    const nextSpecies = species || cur.species;
    const nextColor = color || cur.color;
    const nextDescription = description || cur.description;

    await pool.query(
      `UPDATE animals
       SET name = $1, species = $2, color = $3, description = $4, status_type = $5
       WHERE id = $5`,
      [nextName, nextSpecies, nextColor, nextDescription, status_type || cur.status_type, id]
    );

    // 1) remove fotos marcadas
    if (removePhotos.length > 0) {
      await pool.query(
        `DELETE FROM animal_photos
         WHERE animal_id = $1 AND filename = ANY($2::text[])`,
        [id, removePhotos]
      );
    }

    // 2) adiciona fotos novas (se vierem)
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length > 0) {
      let startPos = 0;

      try {
        const maxPos = await pool.query(
          `SELECT COALESCE(MAX(position), -1) AS maxp
           FROM animal_photos
           WHERE animal_id = $1`,
          [id]
        );
        startPos = Number(maxPos.rows[0].maxp) + 1;

        const values = [];
        const params = [];
        let p = 1;

        files.forEach((f, idx) => {
          values.push(`($${p++}, $${p++}, $${p++})`);
          params.push(id, f.filename, startPos + idx);
        });

        await pool.query(
          `INSERT INTO animal_photos (animal_id, filename, position)
           VALUES ${values.join(', ')}`,
          params
        );
      } catch {
        const values = [];
        const params = [];
        let p = 1;

        files.forEach((f) => {
          values.push(`($${p++}, $${p++})`);
          params.push(id, f.filename);
        });

        await pool.query(
          `INSERT INTO animal_photos (animal_id, filename)
           VALUES ${values.join(', ')}`,
          params
        );
      }
    }

    // 3) checa quantas fotos sobraram
    const after = await getAnimalWithPhotos(id);
    if (!after) return res.status(404).json({ error: 'Animal não encontrado' });

    if (!Array.isArray(after.photos) || after.photos.length < 1) {
      return res.status(400).json({ error: 'O animal não pode ficar sem foto. Mínimo de 1 foto.' });
    }

    // 4) atualiza foto principal (animals.photo) para a primeira existente (se a principal foi removida ou está vazia)
    const first = after.photos[0];
    const main = String(after.photo || '');

    if (!main || (removePhotos.includes(main))) {
      await pool.query(`UPDATE animals SET photo = $1 WHERE id = $2`, [first, id]);
    } else {
      // também garante que a principal existe na lista
      if (!after.photos.includes(main)) {
        await pool.query(`UPDATE animals SET photo = $1 WHERE id = $2`, [first, id]);
      }
    }

    const out = await getAnimalWithPhotos(id);
    return res.json({ message: 'Animal atualizado com sucesso', animal: out });

  } catch (error) {
    console.error('Erro ao atualizar animal:', error?.message, error);
    return res.status(500).json({ error: 'Erro ao atualizar animal' });
  }
});

/* DELETE /animals/:id */
//Exclui animal (somente dono)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const ownerAnimal = await assertAnimalOwner(req, res, id);
    if (!ownerAnimal) return;

    await pool.query('DELETE FROM animal_photos WHERE animal_id = $1', [id]);
    await pool.query('DELETE FROM animals WHERE id = $1', [id]);

    return res.json({ message: 'Animal excluído com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir animal:', error?.message, error);
    return res.status(500).json({ error: 'Erro ao excluir animal' });
  }
});

/* PUT /animals/:id/resolve */
// Marca como resolvido
router.put('/:id/resolve', async (req, res) => {
  const { id } = req.params;

  try {
    const ownerAnimal = await assertAnimalOwner(req, res, id);
    if (!ownerAnimal) return;

    await pool.query(
      "UPDATE animals SET status = 'resolvido' WHERE id = $1",
      [id]
    );

    return res.json({ message: 'Animal marcado como resolvido' });

  } catch (error) {
    console.error('Erro ao resolver animal:', error);
    return res.status(500).json({ error: 'Erro ao atualizar status' });
  }
});

module.exports = router;

// status
router.put('/:id/status-type', async (req, res) => {
  const { id } = req.params;
  const { status_type } = req.body;
  const userId = req.headers['x-user-id'];

  try {
    const animal = await pool.query('SELECT * FROM animals WHERE id = $1', [id]);

    if (!animal.rows.length) {
      return res.status(404).json({ error: 'Animal não encontrado' });
    }

    if (String(animal.rows[0].user_id) !== String(userId)) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    await pool.query(
      'UPDATE animals SET status_type = $1 WHERE id = $2',
      [status_type, id]
    );

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar status' });
  }
});