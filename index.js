// index.js
const express = require('express');
const path = require('path');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const multer = require('multer');

// Configuración de multer para almacenar imágenes de perfil
const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: function(req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static('uploads'));
app.use(express.json());

const jugadores = {};
const espectadores = {};
let comida = generarComida();
const mensajesChat = [];
const puntuaciones = {};

function generarComida() {
    return {
        x: Math.floor(Math.random() * 30),
        y: Math.floor(Math.random() * 30)
    };
}

// Manejo de subida de imágenes de perfil
app.post('/upload-profile', upload.single('profileImage'), (req, res) => {
    if (req.file) {
        res.json({ imageUrl: `/uploads/${req.file.filename}` });
    } else {
        res.status(400).json({ error: 'No se pudo subir la imagen' });
    }
});

io.on('connection', (socket) => {
    console.log(`Usuario conectado: ${socket.id}`);

    // Registro de usuario
    socket.on('register', (data) => {
        if (data.tipo === 'jugador') {
            jugadores[socket.id] = {
                nombre: data.nombre,
                imageUrl: data.imageUrl,
                x: Math.floor(Math.random() * 30),
                y: Math.floor(Math.random() * 30),
                cuerpo: [{ x: 15, y: 15 }],
                direccion: 'RIGHT',
                color: `hsl(${Math.random() * 360}, 100%, 50%)`,
                puntos: 0,
                comidaRecolectada: 0,
                tiempoInicio: Date.now()
            };
            puntuaciones[socket.id] = {
                nombre: data.nombre,
                imageUrl: data.imageUrl,
                puntos: 0
            };
        } else {
            espectadores[socket.id] = {
                nombre: data.nombre,
                imageUrl: data.imageUrl
            };
        }
        
        // Enviar datos iniciales
        socket.emit('chat-history', mensajesChat);
        socket.emit('init', { 
            jugadores, 
            comida, 
            puntuaciones
        });
        
        // Notificar a todos sobre el nuevo usuario
        io.emit('user-joined', { 
            id: socket.id, 
            nombre: data.nombre, 
            tipo: data.tipo 
        });
        io.emit('update-scores', puntuaciones);
    });

    // Manejo de mensajes de chat
    socket.on('chat-message', (mensaje) => {
        const usuario = jugadores[socket.id] || espectadores[socket.id];
        if (usuario) {
            const mensajeCompleto = {
                usuario: usuario.nombre,
                imageUrl: usuario.imageUrl,
                mensaje: mensaje,
                timestamp: new Date().toISOString()
            };
            mensajesChat.push(mensajeCompleto);
            if (mensajesChat.length > 100) mensajesChat.shift();
            io.emit('chat-message', mensajeCompleto);
        }
    });

    // Actualizar movimientos del jugador
    socket.on('move', (direccion) => {
        if (jugadores[socket.id] && direccion) {
            jugadores[socket.id].direccion = direccion;
        }
    });

    // Desconexión de usuario
    socket.on('disconnect', () => {
        if (jugadores[socket.id]) {
            delete jugadores[socket.id];
            delete puntuaciones[socket.id];
        } else if (espectadores[socket.id]) {
            delete espectadores[socket.id];
        }
        io.emit('user-left', socket.id);
        io.emit('update', { jugadores, comida });
        io.emit('update-scores', puntuaciones);
    });
});

// Actualizar juego cada 100ms
setInterval(() => {
    Object.entries(jugadores).forEach(([id, jugador]) => {
        moverJugador(jugador);

        // Verificar colisiones con otros jugadores
        Object.entries(jugadores).forEach(([otroId, otroJugador]) => {
            if (id !== otroId) {
                otroJugador.cuerpo.forEach(parte => {
                    if (jugador.cuerpo[0].x === parte.x && jugador.cuerpo[0].y === parte.y) {
                        // Colisión detectada
                        const tiempoJugado = Math.floor((Date.now() - jugador.tiempoInicio) / 1000);
                        io.to(id).emit('game-over', {
                            puntos: jugador.puntos,
                            tiempoJugado: tiempoJugado,
                            comidaRecolectada: jugador.comidaRecolectada
                        });
                        // Convertir en espectador
                        espectadores[id] = {
                            nombre: jugador.nombre,
                            imageUrl: jugador.imageUrl
                        };
                        delete jugadores[id];
                    }
                });
            }
        });

        // Verificar si come comida
        if (jugador.cuerpo[0].x === comida.x && jugador.cuerpo[0].y === comida.y) {
            jugador.cuerpo.push({});
            jugador.puntos += 10;
            jugador.comidaRecolectada++;
            puntuaciones[id].puntos = jugador.puntos;
            comida = generarComida();
            io.emit('food-collected', {
                jugadorId: id,
                nuevaPuntuacion: jugador.puntos
            });
            io.emit('update-scores', puntuaciones);
        }
    });

    io.emit('update', { jugadores, comida });
}, 100);

function moverJugador(jugador) {
    const cabeza = { ...jugador.cuerpo[0] };

    switch (jugador.direccion) {
        case 'UP': cabeza.y -= 1; break;
        case 'DOWN': cabeza.y += 1; break;
        case 'LEFT': cabeza.x -= 1; break;
        case 'RIGHT': cabeza.x += 1; break;
    }

    // Atravesar paredes
    if (cabeza.x < 0) cabeza.x = 29;
    if (cabeza.x >= 30) cabeza.x = 0;
    if (cabeza.y < 0) cabeza.y = 29;
    if (cabeza.y >= 30) cabeza.y = 0;

    jugador.cuerpo.unshift(cabeza);
    jugador.cuerpo.pop();
}

server.listen(3000, () => {
    console.log('Servidor escuchando en http://localhost:3000');
});
