const socket = io();
let currentRoom = null;
let myName = '';
let drawTarget = null;
let strokes = [];
let currentStroke = null;
let assignedDrawTarget = null;
let assignedGuessTarget = null;

const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const startBtn = document.getElementById('startBtn');
const nameInput = document.getElementById('nameInput');
const joinRoomId = document.getElementById('joinRoomId');
const roomInfo = document.getElementById('roomInfo');
const playersList = document.getElementById('playersList');
const phaseBanner = document.getElementById('phaseBanner');
const writer = document.getElementById('writer');
const drawer = document.getElementById('drawer');
const guesser = document.getElementById('guesser');
const reveal = document.getElementById('reveal');
const promptInput = document.getElementById('promptInput');
const submitPrompt = document.getElementById('submitPrompt');
const randomPromptBtn = document.getElementById('randomPrompt');
const roundsInput = document.getElementById('roundsInput');
const secondsInput = document.getElementById('secondsInput');
const modeSelect = document.getElementById('modeSelect');

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('colorPicker');
const brushSize = document.getElementById('brushSize');

let prompts = [];
fetch('/prompts.json').then(r=>r.json()).then(j=>prompts=j).catch(()=>{prompts=['приведение']});

function showPhase(phase) {
  phaseBanner.textContent = phase.toUpperCase();
  [writer, drawer, guesser, reveal].forEach(el=>el.classList.add('hidden'));
  if (phase === 'writing') writer.classList.remove('hidden');
  if (phase === 'drawing') drawer.classList.remove('hidden');
  if (phase === 'guessing') guesser.classList.remove('hidden');
  if (phase === 'reveal') reveal.classList.remove('hidden');
}

function resizeCanvasToDisplaySize(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawAll();
  }
}
window.addEventListener('resize', ()=>resizeCanvasToDisplaySize(canvas));
resizeCanvasToDisplaySize(canvas);

function getCanvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  return [x, y];
}

createBtn.onclick = ()=>{
  myName = nameInput.value || 'Игрок';
  const settings = { maxRounds: parseInt(roundsInput.value)||3, secondsPerTurn: parseInt(secondsInput.value)||60, mode: modeSelect.value||'classic' };
  socket.emit('createRoom', settings, (res)=>{
    if (res && res.ok) {
      socket.emit('joinRoom', {roomId: res.roomId, name: myName}, (r)=>{ if (r.ok) { currentRoom = r.room.id; updateRoomUI(r.room); } });
    } else { alert('Ошибка при создании комнаты'); }
  });
};

joinBtn.onclick = ()=>{
  myName = nameInput.value || 'Игрок';
  const rid = joinRoomId.value.trim();
  if (!rid) return alert('Введите код комнаты');
  socket.emit('joinRoom', {roomId: rid, name: myName}, (r)=>{
    if (!r.ok) return alert(r.err || 'Не удалось войти');
    currentRoom = r.room.id; updateRoomUI(r.room);
  });
};

startBtn.onclick = ()=>{
  if (!currentRoom) return alert('Создайте или войдите в комнату');
  const settings = { maxRounds: parseInt(roundsInput.value)||3, secondsPerTurn: parseInt(secondsInput.value)||60, mode: modeSelect.value||'classic' };
  socket.emit('startGame', {roomId: currentRoom, settings}, (r)=>{
    if (!r.ok) return alert(r.err || 'Не удалось начать: ' + (r.err||''));
  });
};

socket.on('roomUpdate', room=>updateRoomUI(room));
socket.on('gameStarted', ({phase, round, seconds})=>{ showPhase(phase); });
socket.on('phaseChange', ({phase, seconds, round})=>{ showPhase(phase); assignedDrawTarget=null; assignedGuessTarget=null; strokes=[]; clearCanvas(); });
socket.on('drawFor', ({targetId, prompt, seconds})=>{ assignedDrawTarget = targetId; document.getElementById('drawPrompt').textContent = 'Нарисуйте: ' + prompt; showPhase('drawing'); clearCanvas(); });
socket.on('guessFor', ({targetId, drawing})=>{ assignedGuessTarget = targetId; showPhase('guessing'); });
socket.on('revealData', (history)=>{ renderReveal(history); showPhase('reveal'); });
socket.on('timerStart', ({phase, seconds})=>{ startLocalTimer(seconds); });
socket.on('timerTick', ({remaining})=>{ document.getElementById('phaseBanner').textContent = 'Время: ' + remaining + ' сек'; });

submitPrompt.onclick = ()=>{
  if (!currentRoom) return alert('Не в комнате');
  const p = promptInput.value.trim() || ('Хэллоуин: ' + (prompts[Math.floor(Math.random()*prompts.length)]||'призрак'));
  socket.emit('submitPrompt', {roomId: currentRoom, prompt: p}, (r)=>{ if (!r.ok) alert(r.err || 'Ошибка'); else showPhase('waiting'); });
};

randomPromptBtn.onclick = ()=>{ promptInput.value = prompts[Math.floor(Math.random()*prompts.length)]; };

canvas.addEventListener('pointerdown', (e)=>{ canvas.setPointerCapture(e.pointerId); drawingStart(e); });
canvas.addEventListener('pointermove', (e)=>{ drawingMove(e); });
canvas.addEventListener('pointerup', (e)=>{ canvas.releasePointerCapture(e.pointerId); drawingEnd(); });
canvas.addEventListener('pointercancel', ()=>drawingEnd());

function drawingStart(e) {
  if (!assignedDrawTarget) return alert('Вам не назначено рисовать сейчас.');
  currentStroke = { color: document.getElementById('colorPicker').value||'#fff', size: +document.getElementById('brushSize').value||6, points: [] };
  strokes.push(currentStroke);
  addPoint(e);
}
function drawingMove(e) { if (!currentStroke) return; addPoint(e); drawAll(); }
function drawingEnd() { currentStroke = null; }

function addPoint(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  if (currentStroke) currentStroke.points.push([x,y]);
}

function drawAll() {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  for (const s of strokes) {
    ctx.beginPath();
    ctx.lineJoin = 'round'; ctx.lineCap='round';
    ctx.lineWidth = s.size * (window.devicePixelRatio || 1);
    ctx.strokeStyle = s.color;
    for (let i=0;i<s.points.length;i++) {
      const [x,y] = s.points[i];
      if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();
  }
}

function clearCanvas() { strokes = []; ctx.clearRect(0,0,canvas.width,canvas.height); drawAll(); }

document.getElementById('undoBtn').onclick = ()=>{ strokes.pop(); drawAll(); };
document.getElementById('clearBtn').onclick = ()=>{ clearCanvas(); };
document.getElementById('submitDraw').onclick = ()=>{
  if (!currentRoom) return alert('Не в комнате');
  if (!assignedDrawTarget) return alert('Вам не назначено рисовать');
  socket.emit('drawingData', {roomId: currentRoom, targetId: assignedDrawTarget, strokes}, (r)=>{
    if (!r.ok) alert(r.err || 'Ошибка отправки рисунка');
    else { assignedDrawTarget = null; showPhase('waiting'); clearCanvas(); }
  });
};

document.getElementById('submitGuess').onclick = ()=>{
  const g = document.getElementById('guessInput').value.trim();
  if (!currentRoom) return alert('Не в комнате');
  if (!assignedGuessTarget) return alert('Вам не назначено угадывать');
  socket.emit('submitGuess', {roomId: currentRoom, targetId: assignedGuessTarget, guess: g}, (r)=>{
    if (!r.ok) alert(r.err || 'Ошибка');
    else { assignedGuessTarget = null; showPhase('waiting'); }
  });
};

function updateRoomUI(room) {
  if (!room) return;
  currentRoom = room.id;
  roomInfo.textContent = 'Комната: ' + room.id + ' — Фаза: ' + (room.phase || 'Ожидание');
  playersList.innerHTML = '';
  for (const p of room.players) {
    const li = document.createElement('li'); li.textContent = p.name + (p.id === room.host ? ' (host)' : ''); playersList.appendChild(li);
  }
  const isHost = room.host === socket.id;
  startBtn.disabled = !(isHost && room.players.length >= 2);
}

function renderReveal(history) {
  const el = document.getElementById('revealList'); el.innerHTML = '';
  for (const item of history) {
    const block = document.createElement('div'); block.className='revealEntry';
    const p = document.createElement('div'); p.textContent = 'Начальная фраза: ' + (item.sequence[0] ? item.sequence[0].data : '(пусто)'); block.appendChild(p);
    for (const s of item.sequence.slice(1)) {
      if (s.type === 'drawing') {
        const c = document.createElement('canvas'); c.width=600; c.height=320; c.style.width='100%'; const cctx=c.getContext('2d');
        for (const st of s.data) {
          cctx.lineJoin='round'; cctx.lineCap='round'; cctx.lineWidth = st.size; cctx.strokeStyle = st.color; cctx.beginPath();
          for (let i=0;i<st.points.length;i++){ const [x,y]=st.points[i]; if (i===0) cctx.moveTo(x,y); else cctx.lineTo(x,y);} cctx.stroke();
        }
        block.appendChild(c);
      } else if (s.type === 'guess') {
        const g = document.createElement('div'); g.textContent = 'Угадали: ' + s.data; block.appendChild(g);
      }
    }
    el.appendChild(block);
  }
}

function startLocalTimer(seconds) {
  let rem = seconds;
  document.getElementById('phaseBanner').textContent = 'Время: ' + rem + ' сек';
  const id = setInterval(()=>{ rem--; document.getElementById('phaseBanner').textContent = 'Время: ' + rem + ' сек'; if (rem<=0) clearInterval(id); }, 1000);
}

showPhase('waiting');
