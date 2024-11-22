// game.js
const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gridSize = 20;
const chatContainer = document.getElementById('chat-container');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const playersScores = document.getElementById('players-scores');

let jugadores = {};
let comida = {};
let miTipo = '';
let miNombre = '';
let puntuaciones = {};
let tiempoInicio = null;
let comidaRecolectada = 0;

// Configuración inicial del canvas
canvas.width = 600;
canvas.height = 600;

// Modal de Game Over
function showGameOverModal(stats) {
    const modal = document.getElementById('game-over-modal');
    const finalScore = document.getElementById('final-score');
    const playTime = document.getElementById('play-time');
    const foodCollected = document.getElementById('food-collected');

    finalScore.textContent = stats.puntos;
    playTime.textContent = formatTime(stats.tiempoJugado);
    foodCollected.textContent = stats.comidaRecolectada;

    modal.style.display = 'flex';
    
    // Convertir a espectador automáticamente
    miTipo = 'espectador';
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Actualizar tabla de puntuaciones
function updateScoreboard(scores) {
    playersScores.innerHTML = '';
    Object.entries(scores)
        .sort(([, a], [, b]) => b.puntos - a.puntos)
        .forEach(([id, player]) => {
            const playerCard = document.createElement('div');
            playerCard.className = 'player-score-card';
            playerCard.innerHTML = `
                <div class="player-info">
                    <img src="${player.imageUrl || '/default-avatar.png'}" alt="${player.nombre}" class="player-avatar">
                    <span class="player-name">${player.nombre}</span>
                </div>
                <span class="player-score">${player.puntos}</span>
            `;
            playersScores.appendChild(playerCard);
        });
}

// Registro de usuario con animación
document.getElementById('registro-form').onsubmit = async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('nombre').value;
    const tipo = document.getElementById('tipo').value;
    const imageInput = document.getElementById('profile-image');
    
    let imageUrl = '';
    if (imageInput.files[0]) {
        const formData = new FormData();
        formData.append('profileImage', imageInput.files[0]);
        const response = await fetch('/upload-profile', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        imageUrl = data.imageUrl;
    }

    miNombre = nombre;
    miTipo = tipo;
    
    // Animación de transición
    const registroContainer = document.getElementById('registro-container');
    const gameContainer = document.getElementById('game-container');
    
    registroContainer.style.opacity = '0';
    setTimeout(() => {
        registroContainer.style.display = 'none';
        gameContainer.style.display = 'flex';
        setTimeout(() => {
            gameContainer.style.opacity = '1';
        }, 50);
    }, 500);

    socket.emit('register', { nombre, tipo, imageUrl });
};

// Sistema de chat mejorado
chatInput.onkeypress = (e) => {
    if (e.key === 'Enter' && chatInput.value.trim()) {
        socket.emit('chat-message', chatInput.value.trim());
        chatInput.value = '';
    }
};

function addChatMessage(mensaje, tipo = 'usuario') {
    const div = document.createElement('div');
    div.className = `mensaje ${tipo}`;
    
    if (tipo === 'sistema') {
        div.innerHTML = `<span class="sistema-texto">${mensaje}</span>`;
    } else {
        div.innerHTML = `
            <img src="${mensaje.imageUrl || '/default-avatar.png'}" class="chat-avatar">
            <div class="mensaje-contenido">
                <span class="mensaje-usuario">${mensaje.usuario}</span>
                <span class="mensaje-texto">${mensaje.mensaje}</span>
            </div>
        `;
    }
    
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Eventos del socket
socket.on('chat-message', (mensaje) => {
    addChatMessage(mensaje);
});

socket.on('chat-history', (mensajes) => {
    mensajes.forEach(mensaje => addChatMessage(mensaje));
});

socket.on('user-joined', (data) => {
    addChatMessage(`${data.nombre} se ha unido como ${data.tipo}`, 'sistema');
});

socket.on('user-left', (userId) => {
    const usuario = jugadores[userId];
    if (usuario) {
        addChatMessage(`${usuario.nombre} ha abandonado el juego`, 'sistema');
    }
});

socket.on('game-over', (stats) => {
    showGameOverModal(stats);
});

socket.on('update-scores', (scores) => {
    updateScoreboard(scores);
});

socket.on('init', (data) => {
    jugadores = data.jugadores;
    comida = data.comida;
    puntuaciones = data.puntuaciones;
    updateScoreboard(puntuaciones);
    render();
});

socket.on('update', (data) => {
    jugadores = data.jugadores;
    comida = data.comida;
    render();
});

// Control de movimientos
document.addEventListener('keydown', (e) => {
    if (miTipo === 'jugador') {
        const direccion = {
            ArrowUp: 'UP',
            ArrowDown: 'DOWN',
            ArrowLeft: 'LEFT',
            ArrowRight: 'RIGHT'
        }[e.key];

        if (direccion) {
            socket.emit('move', direccion);
        }
    }
});

// Controles móviles
const mobileControls = document.getElementById('controls');
if (mobileControls) {
    const directions = {
        'up': 'UP',
        'down': 'DOWN',
        'left': 'LEFT',
        'right': 'RIGHT'
    };

    Object.entries(directions).forEach(([key, value]) => {
        const button = mobileControls.querySelector(`[data-direction="${key}"]`);
        if (button) {
            button.addEventListener('touchstart', (e) => {
                e.preventDefault();
                if (miTipo === 'jugador') {
                    socket.emit('move', value);
                }
            });
        }
    });
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Dibujar cuadrícula
    ctx.strokeStyle = '#2c2c2c';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < canvas.width; i += gridSize) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(canvas.width, i);
        ctx.stroke();
    }

    // Dibujar comida con efecto de brillo
    ctx.fillStyle = '#ff4444';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(
        comida.x * gridSize + gridSize/2,
        comida.y * gridSize + gridSize/2,
        gridSize/2,
        0,
        Math.PI * 2
    );
    ctx.fill();
    ctx.shadowBlur = 0;

    // Dibujar jugadores
    Object.entries(jugadores).forEach(([id, jugador]) => {
        // Dibujar cuerpo
        jugador.cuerpo.forEach((parte, index) => {
            ctx.fillStyle = jugador.color;
            if (index === 0) {
                // Cabeza con gradiente
                const gradient = ctx.createRadialGradient(
                    parte.x * gridSize + gridSize/2,
                    parte.y * gridSize + gridSize/2,
                    0,
                    parte.x * gridSize + gridSize/2,
                    parte.y * gridSize + gridSize/2,
                    gridSize
                );
                gradient.addColorStop(0, jugador.color);
                gradient.addColorStop(1, shadeColor(jugador.color, -20));
                ctx.fillStyle = gradient;
            }
            ctx.fillRect(parte.x * gridSize, parte.y * gridSize, gridSize, gridSize);
        });
        
        // Nombre del jugador con sombra
        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 4;
        ctx.fillText(
            jugador.nombre,
            jugador.cuerpo[0].x * gridSize + gridSize/2,
            jugador.cuerpo[0].y * gridSize - 5
        );
        ctx.shadowBlur = 0;
    });
}

// Utilidad para oscurecer colores
function shadeColor(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return '#' + (0x1000000 +
        (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
        (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
        (B < 255 ? B < 1 ? 0 : B : 255)
    ).toString(16).slice(1);
}

// Iniciar el loop de renderizado
function gameLoop() {
    render();
    requestAnimationFrame(gameLoop);
}

gameLoop();