'use strict';

require("dotenv").config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');

const authRoutes = require('./routes/auth');
const animalRoutes = require('./routes/animals');
const usersRoutes = require('./routes/users');
const chatRoutes = require('./routes/chat');

const app = express();
const server = http.createServer(app);

const { Server } = require('socket.io');
const io = new Server(server, {
  cors: { origin: true, methods: ['GET', 'POST'] }
});

/* MIDDLEWARES */
app.use(cors());
app.use(express.json());

/* UPLOADS */
app.use('/uploads', express.static(path.resolve(__dirname, 'uploads')));

/* ROTAS API */
app.use('/auth', authRoutes);
app.use('/animals', animalRoutes);
app.use('/users', usersRoutes);
app.use('/chat', chatRoutes);

/* FRONTEND */
app.use(express.static(path.resolve(__dirname, '..', 'frontend')));

/* SOCKET.IO */
io.on('connection', (socket) => {

  socket.on('join', ({ conversationId }) => {
    if (!conversationId) return;
    socket.join(`conv:${conversationId}`);
  });

  socket.on('send_message', ({ conversationId, message }) => {
    if (!conversationId || !message) return;

    io.to(`conv:${conversationId}`).emit('new_message', message);
    io.to(`conv:${conversationId}`).emit('refresh_conversations');
  });

  /* evento disparado quando usuário está digitando */

  socket.on('typing', ({ conversationId }) => {

    if (!conversationId) return;

    /* envia para todos da conversa exceto quem digitou */

    socket.to(`conv:${conversationId}`).emit('typing');

  });

});

/* START */
server.listen(3000, () => {
  console.log('Servidor rodando em http://localhost:3000');
});
