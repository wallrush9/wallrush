const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

// Server ishlayotganini brauzerda tekshirish uchun oddiy sahifa
app.get('/', (req, res) => {
  res.send('<h1>WallRush Backend Server Ishlamoqda! </h1>');
});

const server = http.createServer(app);

// Socket.io sozlamalari (CORS - istalgan manbadan ulanishga ruxsat beradi)
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Navbatdagi o'yinchilar ro'yxati va aktiv xonalar
let queue = [];
const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`⚡ Yangi o'yinchi ulandi: ${socket.id}`);

  // O'yinchi "Onlayn o'ynash" tugmasini bosganda
  socket.on('join_game', (userData) => {
    // Agar o'yinchi allaqachon navbatda bo'lsa, qayta qo'shmaymiz
    if (queue.some(p => p.id === socket.id)) return;

    socket.userData = userData || { name: 'Player' };
    queue.push(socket);
    console.log(` O'yinchi navbatga qo'shildi. Hozir navbatda: ${queue.length} kishi`);

    // Navbatda kamida 2 kishi yig'ilganda xona yaratamiz
    if (queue.length >= 2) {
      const p1 = queue.shift();
      const p2 = queue.shift();

      const roomId = `room_${p1.id}_${p2.id}`;

      p1.join(roomId);
      p2.join(roomId);

      // Xona ma'lumotlarini saqlash
      rooms.set(roomId, {
        p1: p1.id,
        p2: p2.id,
        turn: 'blue'
      });

      // 1-o'yinchiga xabar (Ko'k shar)
      p1.emit('game_start', {
        roomId,
        color: 'blue',
        turn: 'blue'
      });

      // 2-o'yinchiga xabar (Qizil shar)
      p2.emit('game_start', {
        roomId,
        color: 'red',
        turn: 'blue'
      });

      console.log(` O'yin boshlandi! Xona: ${roomId}`);
    }
  });

  // O'yinchining harakatlarini raqibga uzatish (Shar harakati yoki devor qo'yish)
  socket.on('make_move', (data) => {
    // data: { roomId, type: 'move' | 'wall', payload: { ... } }
    const { roomId, type, payload } = data;

    if (!roomId) return;

    // Harakatni shu xonadagi raqibga yuboramiz
    socket.to(roomId).emit('opponent_move', {
      type,
      payload
    });
  });

  // O'yin g'olibi aniqlanganda
  socket.on('game_over', (data) => {
    const { roomId, winnerColor } = data;
    io.to(roomId).emit('game_over_result', { winnerColor });
    rooms.delete(roomId);
  });

  // O'yinchi interneti uzilsa yoki brauzerni yopsa
  socket.on('disconnect', () => {
    console.log(` O'yinchi tark etdi: ${socket.id}`);

    // Navbatdan chiqarib tashlaymiz
    queue = queue.filter(p => p.id !== socket.id);

    // Agar aktiv o'yinda bo'lsa, raqibiga bildirishnoma yuboramiz
    for (const [roomId, room] of rooms.entries()) {
      if (room.p1 === socket.id || room.p2 === socket.id) {
        socket.to(roomId).emit('opponent_left', {
          message: "Raqibingiz o'yinni tark etdi."
        });
        rooms.delete(roomId);
        break;
      }
    }
  });
});

// Port sozlamasi (Railway avtomatik port ajratadi)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(` WallRush serveri ${PORT}-portda ishga tushdi!`);
});
