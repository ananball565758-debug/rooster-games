const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

let rooms = {};

io.on('connection', (socket) => {
    console.log('ผู้เล่นเชื่อมต่อ:', socket.id);

    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        
        if (!rooms[roomId]) {
            rooms[roomId] = { p1: null, p2: null, players: {}, timeLeft: 60, timer: null };
        }

        let room = rooms[roomId];
        let role = '';

        if (!room.p1) {
            room.p1 = socket.id;
            role = 'p1';
        } else if (!room.p2 && room.p1 !== socket.id) {
            room.p2 = socket.id;
            role = 'p2';
        } else {
            socket.emit('room-full');
            return;
        }

        // ปรับค่าพลังชีวิต (HP) เริ่มต้นเป็น 1000 ตามตัวเกมล่าสุด
        room.players[socket.id] = { 
            role: role, 
            x: role === 'p1' ? 200 : 750, 
            y: 460, 
            hp: 1000, 
            maxHp: 1000,
            energy: 0,
            facingRight: role === 'p1',
            isBlocking: false,
            isAttacking: false,
            isUltimate: false,
            attackType: null
        };

        socket.emit('assigned-role', { role: role });

        if (room.p1 && room.p2) {
            io.to(roomId).emit('start-countdown');

            if (!room.timer) {
                room.timer = setInterval(() => {
                    if (room && room.timeLeft > 0) {
                        room.timeLeft--;
                        io.to(roomId).emit('update-timer', room.timeLeft);
                    } else {
                        if (room && room.timer) {
                            clearInterval(room.timer);
                            room.timer = null;
                        }
                        io.to(roomId).emit('time-up');
                    }
                }, 1000);
            }
        }
    });

    socket.on('player-action', (data) => {
        let room = rooms[data.roomId];
        if (room && room.players[socket.id]) {
            let p = room.players[socket.id];
            p.x = data.x;
            p.y = data.y;
            p.facingRight = data.facingRight;
            p.isBlocking = data.isBlocking;
            p.isAttacking = data.isAttacking;
            p.isUltimate = data.isUltimate;
            p.attackType = data.attackType;

            io.to(data.roomId).emit('update-players', room.players);
        }
    });

    socket.on('player-attack', (data) => {
        let room = rooms[data.roomId];
        if (!room) return;

        let targetSocketId = (data.targetRole === 'p1') ? room.p1 : room.p2;
        let attackerSocketId = (socket.id === room.p1) ? room.p1 : room.p2;

        let target = room.players[targetSocketId];
        let attacker = room.players[attackerSocketId];

        if (target && attacker) {
            let isUlt = (data.attackType === 'ultimate');
            target.hp = Math.max(0, target.hp - data.damage);

            if (!isUlt) {
                attacker.energy = Math.min(100, (attacker.energy || 0) + 25);
            } else {
                attacker.energy = 0;
            }

            io.to(data.roomId).emit('apply-hit', {
                targetRole: data.targetRole,
                damage: data.damage,
                isUltimate: isUlt
            });

            io.to(data.roomId).emit('update-players', room.players);
        }
    });

    socket.on('disconnect', () => {
        console.log('ผู้เล่นตัดการเชื่อมต่อ:', socket.id);
        for (let roomId in rooms) {
            let room = rooms[roomId];
            if (room.p1 === socket.id || room.p2 === socket.id) {
                if (room.timer) clearInterval(room.timer);
                delete rooms[roomId];
                io.to(roomId).emit('room-full');
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server เปิดใช้งานแล้วที่พอร์ต ${PORT}`);
});