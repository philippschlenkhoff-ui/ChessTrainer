import { Game } from "https://cdn.jsdelivr.net/npm/js-chess-engine@2.0.0/+esm";

const statusText = document.getElementById("statusText");
const moveListEl = document.getElementById("moveList");
const colorSelect = document.getElementById("colorSelect");
const depthRange = document.getElementById("depthRange");
const depthValue = document.getElementById("depthValue");
const skillRange = document.getElementById("skillRange");
const skillValue = document.getElementById("skillValue");
const newGameBtn = document.getElementById("newGameBtn");
const swapSidesBtn = document.getElementById("swapSidesBtn");
const tacticsBtn = document.getElementById("tacticsBtn");
const analysisHintBtn = document.getElementById("analysisHintBtn");
const pgnInput = document.getElementById("pgnInput");
const pgnAnalyzeBtn = document.getElementById("pgnAnalyzeBtn");
const pgnPrevBtn = document.getElementById("pgnPrevBtn");
const pgnNextBtn = document.getElementById("pgnNextBtn");
const pgnAnalysisList = document.getElementById("pgnAnalysisList");
const boardEl = document.getElementById("board");
const testModeBtn = document.getElementById("testModeBtn");
const loaderOverlay = document.getElementById("loader");
const loaderMiniBoardEl = document.getElementById("loaderMiniBoard");
const mainMenu = document.getElementById("mainMenu");
const menuPlayBtn = document.getElementById("menuPlayBtn");
const menuTacticsBtn = document.getElementById("menuTacticsBtn");
const menuAnalysisBtn = document.getElementById("menuAnalysisBtn");
const backToMenuBtn = document.getElementById("backToMenuBtn");
const menuDemoBoardEl = document.getElementById("menuDemoBoard");
let audioCtx = null;

let engineGame = null;
let boardConfig = null;
let playerColor = "white";
let engineBusy = false;
let selectedSquare = null;
let legalTargets = new Set();
let pendingPromotion = null;
let gameOverShown = false;
let testMode = false;
let testLoopRunning = false;
let analysisMode = false;
let pgnReplay = [];
let pgnReplayStates = [];
let pgnReplayIndex = -1;
let pgnReplayActive = false;
let menuDemoGame = null;
let menuDemoRunning = false;
let menuDemoPly = 0;
let stockfish = null;
let stockfishReady = false;
let stockfishThinking = false;
let stockfishBestMoveHandler = null;
let stockfishPendingMove = false;
let gameMovesUci = [];
const promotionModal = document.getElementById("promotionModal");
const promotionButtons = document.querySelectorAll(".promotion-choices .promo-btn");
const gameOverModal = document.getElementById("gameOverModal");
const gameOverTitle = document.getElementById("gameOverTitle");
const gameOverText = document.getElementById("gameOverText");
const gameOverNewGameBtn = document.getElementById("gameOverNewGameBtn");
const gameOverCloseBtn = document.getElementById("gameOverCloseBtn");

function setStatus(text) {
  if (statusText) statusText.textContent = text;
}

function squareId(fileIndex, rankIndex, orientationWhite = true) {
  const files = orientationWhite ? ["a","b","c","d","e","f","g","h"] : ["h","g","f","e","d","c","b","a"];
  const ranks = orientationWhite ? ["8","7","6","5","4","3","2","1"] : ["1","2","3","4","5","6","7","8"];
  return files[fileIndex] + ranks[rankIndex];
}

function pieceSVG(pieceCode) {
  if (!pieceCode) return "";
  const isWhite = pieceCode[0] === "w";
  const type = pieceCode[1].toLowerCase();
  const whiteSymbols = { p:"♙", r:"♖", n:"♘", b:"♗", q:"♕", k:"♔" };
  const blackSymbols = { p:"♟", r:"♜", n:"♞", b:"♝", q:"♛", k:"♚" };
  const symbol = isWhite ? whiteSymbols[type] || "?" : blackSymbols[type] || "?";
  const textColor = isWhite ? "#ffffff" : "#000000";
  const strokeColor = isWhite ? "#000000" : "#ffffff";
  const strokeWidth = 3.0;
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <text x="32" y="46" font-size="46" text-anchor="middle"
          fill="${textColor}"
          stroke="${strokeColor}"
          stroke-width="${strokeWidth}"
          style="paint-order: stroke;"
          font-family="Segoe UI Symbol, Segoe UI, Arial"
          font-weight="600">${symbol}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function showPromotionModal(color) {
  if (!promotionModal) return;
  promotionModal.classList.add("visible");
  promotionButtons.forEach(btn => {
    const piece = btn.dataset.piece;
    if (color === "white") {
      if (piece === "q") btn.textContent = "♕";
      else if (piece === "r") btn.textContent = "♖";
      else if (piece === "b") btn.textContent = "♗";
      else if (piece === "n") btn.textContent = "♘";
      btn.style.color = "#ffffff";
    } else {
      if (piece === "q") btn.textContent = "♛";
      else if (piece === "r") btn.textContent = "♜";
      else if (piece === "b") btn.textContent = "♝";
      else if (piece === "n") btn.textContent = "♞";
      btn.style.color = "#000000";
    }
  });
}

function hidePromotionModal() {
  if (!promotionModal) return;
  promotionModal.classList.remove("visible");
}

function gameStatus() {
  if (!engineGame || !engineGame.exportJson) return null;
  try {
    return engineGame.exportJson();
  } catch (_) {
    return null;
  }
}

function computeStockfishSkill() {
  const level = computeEngineLevel();
  if (level === 1) return 0;
  if (level === 2) return 2;
  if (level === 3) return 5;
  if (level === 4) return 8;
  if (level === 5) return 11;
  if (level === 6) return 14;
  if (level === 7) return 17;
  return 20;
}

function computeSearchDepthFromLevel() {
  const level = computeEngineLevel();
  if (level <= 2) return 6;
  if (level <= 4) return 10;
  if (level <= 6) return 14;
  if (level === 7) return 18;
  return 22;
}

function initStockfish() {
  stockfishReady = false;
  stockfishThinking = false;
  stockfishBestMoveHandler = null;
  stockfishPendingMove = false;
  try {
    if (typeof Worker === "undefined") {
      setStatus("Stockfish: Web Worker werden nicht unterstützt.");
      stockfish = null;
      return;
    }
    stockfish = new Worker("stockfish.js-master/stockfish.js-master/src/stockfish.js");
  } catch (e) {
    stockfish = null;
    setStatus("Stockfish-Worker konnte nicht erstellt werden.");
    return;
  }
  const skill = computeStockfishSkill();
  stockfish.postMessage("uci");
  stockfish.postMessage("setoption name Skill Level value " + skill);
  stockfish.postMessage("isready");
  stockfish.onmessage = (e) => {
    const data = typeof e.data === "string" ? e.data : "";
    if (!data) return;
    if (data.startsWith("readyok")) {
      stockfishReady = true;
      if (stockfishPendingMove) {
        stockfishPendingMove = false;
        engineMove();
      }
      return;
    }
    if (data.startsWith("bestmove")) {
      stockfishThinking = false;
      const parts = data.split(" ");
      if (parts.length >= 2) {
        const mv = parts[1].trim();
        if (stockfishBestMoveHandler) {
          stockfishBestMoveHandler(mv);
        }
      }
      return;
    }
  };
}

function addUciMove(from, to, promotion) {
  const fromLower = String(from || "").toLowerCase();
  const toLower = String(to || "").toLowerCase();
  if (!fromLower || !toLower || fromLower.length !== 2 || toLower.length !== 2) return;
  let move = fromLower + toLower;
  if (promotion) {
    move += String(promotion).toLowerCase();
  }
  gameMovesUci.push(move);
}

function setTestModeUI(running) {
  const label = "Testmodus: Engine vs Engine";
  if (testModeBtn) {
    testModeBtn.textContent = running ? label + " (läuft)" : label;
    testModeBtn.disabled = running;
  }
  if (colorSelect) colorSelect.disabled = running;
  if (depthRange) depthRange.disabled = running;
  if (skillRange) skillRange.disabled = running;
  if (newGameBtn) newGameBtn.disabled = running;
  if (swapSidesBtn) swapSidesBtn.disabled = running;
}

function computeEngineLevel() {
  const raw = parseInt(skillRange.value, 10);
  if (isNaN(raw)) return 8;
  return Math.max(1, Math.min(8, raw));
}

function computeAiLevelFromLichess() {
  const level = computeEngineLevel();
  if (level <= 2) return 1;
  if (level <= 4) return 2;
  if (level <= 6) return 3;
  if (level === 7) return 4;
  return 5;
}

function showMainMenu() {
  if (mainMenu) mainMenu.classList.add("visible");
  startMenuDemo();
}

function hideMainMenu() {
  if (mainMenu) mainMenu.classList.remove("visible");
}

function setModeUI(mode) {
  const playSection = document.querySelector(".mode-section.mode-play");
  const tacticsSection = document.querySelector(".mode-section.mode-tactics");
  const analysisSection = document.querySelector(".mode-section.mode-analysis");
  if (playSection) playSection.classList.add("hidden");
  if (tacticsSection) tacticsSection.classList.add("hidden");
  if (analysisSection) analysisSection.classList.add("hidden");
  if (mode === "play" && playSection) playSection.classList.remove("hidden");
  if (mode === "tactics" && tacticsSection) tacticsSection.classList.remove("hidden");
  if (mode === "analysis" && analysisSection) analysisSection.classList.remove("hidden");
}

function startMenuDemo() {
  if (!menuDemoBoardEl) return;
  if (!mainMenu || !mainMenu.classList.contains("visible")) return;
  if (menuDemoRunning) return;
  menuDemoRunning = true;
  if (!menuDemoGame) {
    menuDemoGame = new Game();
    menuDemoPly = 0;
  }
  buildMiniBoard(menuDemoBoardEl);
  try {
    const cfg = menuDemoGame.exportJson ? menuDemoGame.exportJson() : null;
    if (cfg) {
      renderMiniBoard(menuDemoBoardEl, cfg);
    }
  } catch (_) {
  }
  function step() {
    if (!mainMenu || !mainMenu.classList.contains("visible") || !menuDemoBoardEl) {
      menuDemoRunning = false;
      return;
    }
    let beforeCfg = null;
    let afterCfg = null;
    try {
      beforeCfg = menuDemoGame.exportJson ? menuDemoGame.exportJson() : null;
    } catch (_) {
      beforeCfg = null;
    }
    try {
      const level = 2;
      const best = findBestMoveForGame(menuDemoGame, level);
      if (best && best.move) {
        const entries = Object.entries(best.move);
        if (entries.length > 0) {
          const [from, to] = entries[0];
          afterCfg = menuDemoGame.move(from, to);
          if (beforeCfg && afterCfg) {
            animateMiniMove(menuDemoBoardEl, from, to, beforeCfg, afterCfg);
          } else if (afterCfg) {
            renderMiniBoard(menuDemoBoardEl, afterCfg);
          }
        }
      }
    } catch (_) {
    }
    if (!afterCfg) {
      try {
        const cfgFallback = menuDemoGame.exportJson ? menuDemoGame.exportJson() : null;
        if (cfgFallback) {
          renderMiniBoard(menuDemoBoardEl, cfgFallback);
        }
      } catch (_) {
      }
    }
    menuDemoPly += 1;
    if (menuDemoPly >= 60) {
      menuDemoGame = new Game();
      menuDemoPly = 0;
      try {
        const cfg2 = menuDemoGame.exportJson ? menuDemoGame.exportJson() : null;
        if (cfg2) {
          renderMiniBoard(menuDemoBoardEl, cfg2);
        }
      } catch (_) {
      }
    }
    setTimeout(step, 900);
  }
  setTimeout(step, 900);
}

function showGameOver(type, status) {
  gameOverShown = true;
  if (type === "matt") {
    if (gameOverTitle) gameOverTitle.textContent = "Schachmatt";
    let text = "Die Partie ist durch Schachmatt beendet.";
    if (status && status.turn) {
      const loser = status.turn === "white" ? "Weiß" : "Schwarz";
      const winner = status.turn === "white" ? "Schwarz" : "Weiß";
      text = winner + " gewinnt, " + loser + " ist matt.";
    }
    if (gameOverText) gameOverText.textContent = text;
  } else {
    if (gameOverTitle) gameOverTitle.textContent = "Remis";
    if (gameOverText) gameOverText.textContent = "Die Partie endete unentschieden.";
  }
  if (gameOverModal) gameOverModal.classList.add("visible");
}

function hideGameOver() {
  if (!gameOverModal) return;
  gameOverModal.classList.remove("visible");
}

function boardFromConfig(config) {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  if (!config || !config.pieces) return board;
  const files = ["A","B","C","D","E","F","G","H"];
  for (const key in config.pieces) {
    const piece = config.pieces[key];
    const fileChar = key[0].toUpperCase();
    const rankChar = key[1];
    const fileIndex = files.indexOf(fileChar);
    const rankIndex = 8 - parseInt(rankChar, 10);
    if (fileIndex < 0 || rankIndex < 0 || rankIndex > 7) continue;
    const isUpper = piece === piece.toUpperCase();
    const type = piece.toLowerCase();
    board[rankIndex][fileIndex] = { type, color: isUpper ? "w" : "b" };
  }
  return board;
}

function buildMiniBoard(target) {
  if (!target) return;
  target.innerHTML = "";
  const files = ["a","b","c","d","e","f","g","h"];
  const ranks = ["8","7","6","5","4","3","2","1"];
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = files[f] + ranks[r];
      const div = document.createElement("div");
      div.className = "loader-mini-square " + (((r + f) % 2 === 0) ? "light" : "dark");
      div.dataset.square = sq;
      target.appendChild(div);
    }
  }
}

function renderMiniBoard(target, config) {
  if (!target || !config) return;
  const board = boardFromConfig(config);
  const squares = target.querySelectorAll(".loader-mini-square");
  squares.forEach((el, idx) => {
    const f = idx % 8;
    const r = Math.floor(idx / 8);
    const pieceInfo = board[r][f];
    if (pieceInfo) {
      const code = (pieceInfo.color === "w" ? "w" : "b") + pieceInfo.type.toUpperCase();
      el.style.backgroundImage = `url('${pieceSVG(code)}')`;
      el.style.backgroundSize = "90% 90%";
      el.style.backgroundRepeat = "no-repeat";
      el.style.backgroundPosition = "center";
    } else {
      el.style.backgroundImage = "none";
    }
    el.classList.remove("demo-from", "demo-to");
  });
}

function highlightMiniMove(target, from, to) {
  if (!target) return;
  const fromLower = from.toLowerCase();
  const toLower = to.toLowerCase();
  target.querySelectorAll(".loader-mini-square").forEach(el => {
    const sq = el.dataset.square.toLowerCase();
    el.classList.remove("demo-from", "demo-to");
    if (sq === fromLower) el.classList.add("demo-from");
    if (sq === toLower) el.classList.add("demo-to");
  });
}

function buildLoaderMiniBoard() {
  buildMiniBoard(loaderMiniBoardEl);
}

function renderLoaderMiniBoard(config) {
  renderMiniBoard(loaderMiniBoardEl, config);
}

function highlightLoaderMove(from, to) {
  highlightMiniMove(loaderMiniBoardEl, from, to);
}

function zoomElementToSquare(container, squareSelector, squareName, scale, duration) {
}

function playMoveSound() {
  try {
    if (!audioCtx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      audioCtx = new Ctor();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.value = 620;
    gain.gain.value = 0.14;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.start(now);
    osc.stop(now + 0.16);
  } catch (_) {
  }
}
function animateMiniMove(target, from, to, beforeConfig, afterConfig) {
  if (!target || !beforeConfig || !afterConfig) return;
  renderMiniBoard(target, beforeConfig);
  highlightMiniMove(target, from, to);
  const fromLower = from.toLowerCase();
  const squares = target.querySelectorAll(".loader-mini-square");
  let fromSquareEl = null;
  squares.forEach(el => {
    if (el.dataset.square.toLowerCase() === fromLower) fromSquareEl = el;
  });
  if (!fromSquareEl) {
    renderMiniBoard(target, afterConfig);
    return;
  }
  const pieceMap = beforeConfig.pieces || {};
  const fromKey = from.toUpperCase();
  const piece = pieceMap[fromKey];
  if (!piece) {
    renderMiniBoard(target, afterConfig);
    return;
  }
  const isUpper = piece === piece.toUpperCase();
  const type = piece.toLowerCase();
  const color = isUpper ? "w" : "b";
  const code = color + type.toUpperCase();
  const boardRect = target.getBoundingClientRect();
  const fromRect = fromSquareEl.getBoundingClientRect();
  const overlay = document.createElement("div");
  overlay.className = "loader-mini-piece-float active";
  overlay.style.backgroundImage = `url('${pieceSVG(code)}')`;
  const startLeft = fromRect.left - boardRect.left;
  const startTop = fromRect.top - boardRect.top;
  overlay.style.left = `${startLeft}px`;
  overlay.style.top = `${startTop}px`;
  target.appendChild(overlay);
  const toLower = to.toLowerCase();
  let toSquareEl = null;
  squares.forEach(el => {
    if (el.dataset.square.toLowerCase() === toLower) toSquareEl = el;
  });
  if (!toSquareEl) {
    renderMiniBoard(target, afterConfig);
    target.removeChild(overlay);
    return;
  }
  const toRect = toSquareEl.getBoundingClientRect();
  const endLeft = toRect.left - boardRect.left;
  const endTop = toRect.top - boardRect.top;
  requestAnimationFrame(() => {
    overlay.style.left = `${endLeft}px`;
    overlay.style.top = `${endTop}px`;
  });
  setTimeout(() => {
    renderMiniBoard(target, afterConfig);
    if (overlay.parentNode === target) {
      target.removeChild(overlay);
    }
  }, 520);
}

function animateLoaderMove(from, to, beforeConfig, afterConfig) {
  animateMiniMove(loaderMiniBoardEl, from, to, beforeConfig, afterConfig);
}

function renderBoardGrid() {
  const orientationWhite = playerColor === "white";
  boardEl.innerHTML = "";
  boardEl.className = "board-grid";
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = squareId(f, r, orientationWhite);
      const div = document.createElement("div");
      div.className = "square " + (((r + f) % 2 === 0) ? "light" : "dark");
      div.dataset.square = sq;
      div.addEventListener("click", onSquareClick);
      boardEl.appendChild(div);
    }
  }
  updateBoard();
}

function onSquareClick(e) {
  if (!engineGame || engineBusy || testMode) return;
  const s = gameStatus();
  if (s && (s.isCheckmate || s.isStalemate || s.isThreefoldRepetition || s.isInsufficientMaterial)) return;
  const sq = e.currentTarget.dataset.square;
  const key = sq.toUpperCase();
  if (!selectedSquare) {
    if (!boardConfig || !boardConfig.pieces) return;
    const piece = boardConfig.pieces[key];
    if (!piece) return;
    const isWhitePiece = piece === piece.toUpperCase();
    const pieceColor = isWhitePiece ? "white" : "black";
    if (!analysisMode && pieceColor !== playerColor) return;
    const movesMap = engineGame.moves(key);
    const targets = movesMap[key] || [];
    if (!targets.length) return;
    selectedSquare = key;
    legalTargets = new Set(targets.map(t => t.toLowerCase()));
    highlightSelection();
    return;
  }
  const sqLower = sq.toLowerCase();
  if (sqLower === selectedSquare.toLowerCase()) {
    clearSelection();
    return;
  }
  if (legalTargets.has(sqLower)) {
    const piece = boardConfig && boardConfig.pieces ? boardConfig.pieces[selectedSquare] : null;
    const isWhitePawn = piece === "P";
    const isBlackPawn = piece === "p";
    const targetRank = key[1];
    if ((isWhitePawn && targetRank === "8") || (isBlackPawn && targetRank === "1")) {
      pendingPromotion = { from: selectedSquare, to: key, color: isWhitePawn ? "white" : "black" };
      clearSelection();
      showPromotionModal(pendingPromotion.color);
      return;
    }
    try {
      const result = engineGame.move(selectedSquare, key);
      boardConfig = result;
      const moveText = `${selectedSquare.toLowerCase()}-${key.toLowerCase()}`;
      appendMoveToList(moveText);
      addUciMove(selectedSquare, key);
      markLastMove(selectedSquare, key);
      clearSelection();
      updateBoard();
      playMoveSound();
      if (!analysisMode) {
        setTimeout(engineMove, 140);
      }
    } catch (_) {
      clearSelection();
    }
    return;
  }
  clearSelection();
}

function highlightSelection() {
  document.querySelectorAll(".square").forEach(el => {
    const sq = el.dataset.square;
    const sqLower = sq.toLowerCase();
    if (selectedSquare && sqLower === selectedSquare.toLowerCase()) el.classList.add("selected");
    else if (legalTargets.has(sqLower)) el.classList.add("target");
  });
}

function clearSelection() {
  selectedSquare = null;
  legalTargets.clear();
  document.querySelectorAll(".square").forEach(el => {
    el.classList.remove("selected", "target");
  });
}

function appendMoveToList(text) {
  const li = document.createElement("li");
  li.textContent = text;
  moveListEl.appendChild(li);
  li.scrollIntoView({ block: "nearest" });
}

function resetMovesList() {
  moveListEl.innerHTML = "";
}

function updateBoard() {
  if (!boardConfig) return;
  const orientationWhite = playerColor === "white";
  const board = boardFromConfig(boardConfig);
  document.querySelectorAll(".square").forEach((el, idx) => {
    const f = idx % 8;
    const r = Math.floor(idx / 8);
    const fileIdx = orientationWhite ? f : 7 - f;
    const rankIdx = orientationWhite ? r : 7 - r;
    const pieceInfo = board[rankIdx][fileIdx];
    if (pieceInfo) {
      const code = (pieceInfo.color === "w" ? "w" : "b") + pieceInfo.type.toUpperCase();
      el.style.backgroundImage = `url('${pieceSVG(code)}')`;
      el.style.backgroundSize = "90% 90%";
      el.style.backgroundRepeat = "no-repeat";
      el.style.backgroundPosition = "center";
    } else {
      el.style.backgroundImage = "none";
    }
    el.classList.remove("move-from", "move-to", "engine-sugg-from", "engine-sugg-to");
  });
  const s = gameStatus();
  if (s) {
    if (s.checkMate) {
      setStatus("Schachmatt");
      if (!gameOverShown) showGameOver("matt", s);
    } else if (s.staleMate) {
      setStatus("Remis");
      if (!gameOverShown) showGameOver("remis", s);
    } else if (s.check) {
      setStatus("Schach");
    } else {
      setStatus(engineBusy ? "Engine denkt ..." : "Bereit");
    }
  } else {
    setStatus(engineBusy ? "Engine denkt ..." : "Bereit");
  }
}

function computeMaterial(config, side) {
  if (!config || !config.pieces) return 0;
  const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  let total = 0;
  for (const key in config.pieces) {
    const piece = config.pieces[key];
    const isWhitePiece = piece === piece.toUpperCase();
    const color = isWhitePiece ? "white" : "black";
    const t = piece.toLowerCase();
    const v = values[t] || 0;
    if (color === side) total += v;
    else total -= v;
  }
  return total;
}

function findBestMoveForGame(game, level) {
  if (!game || !game.exportJson || !game.moves) return null;
  let cfg = null;
  try {
    cfg = game.exportJson();
  } catch (_) {
    cfg = null;
  }
  if (!cfg || !cfg.pieces) return null;
  const side = cfg.turn || "white";
  const movesMap = game.moves();
  const candidates = [];
  for (const from in movesMap) {
    const targets = movesMap[from] || [];
    targets.forEach(to => {
      candidates.push({ from, to });
    });
  }
  if (!candidates.length) return null;
  let best = null;
  for (const mv of candidates) {
    let nextCfg = null;
    try {
      const tmp = new Game(cfg);
      nextCfg = tmp.move(mv.from, mv.to);
    } catch (_) {
      nextCfg = null;
    }
    if (!nextCfg || !nextCfg.pieces) continue;
    const score = computeMaterial(nextCfg, side);
    if (!best || score > best.score) {
      best = { from: mv.from, to: mv.to, board: nextCfg, score };
    }
  }
  if (!best) return null;
  return { move: { [best.from]: best.to }, board: best.board };
}

function computeAnalysisHint() {
  if (!engineGame || !boardConfig || !boardConfig.pieces) return null;
  const status = gameStatus();
  const side = status && status.turn ? status.turn : playerColor;
  const pieces = boardConfig.pieces;
  const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  let best = null;
  for (const key in pieces) {
    const pieceChar = pieces[key];
    const isWhitePiece = pieceChar === pieceChar.toUpperCase();
    const pieceColor = isWhitePiece ? "white" : "black";
    if (pieceColor !== side) continue;
    const movesMap = engineGame.moves(key);
    const targets = movesMap[key] || [];
    for (const target of targets) {
      const targetKey = target.toUpperCase();
      const targetPiece = pieces[targetKey];
      let score = 0;
      if (targetPiece) {
        const t = targetPiece.toLowerCase();
        score += values[t] || 0;
      }
      if (!best || score > best.score) {
        best = { from: key, to: target, score, side };
      }
    }
  }
  return best;
}

function parsePgnMoves(pgnText) {
  if (!pgnText) return [];
  const lines = pgnText.split(/\r?\n/);
  const withoutHeaders = lines.filter(line => !line.trim().startsWith("[")).join(" ");
  const noComments = withoutHeaders.replace(/\{[^}]*\}/g, " ").replace(/;[^\n]*/g, " ");
  let text = noComments.replace(/\s+/g, " ").trim();
  text = text.replace(/\b(1-0|0-1|1\/2-1\/2|\*)\b/g, " ");
  const tokens = text.split(" ").filter(Boolean);
  const moves = [];
  tokens.forEach(tok => {
    const t = tok.trim();
    if (!t) return;
    if (/^\d+\./.test(t)) return;
    moves.push(t);
  });
  return moves;
}

function cleanSanToken(san) {
  let s = san.trim();
  s = s.replace(/[+#]+$/g, "");
  s = s.replace(/[!?]+$/g, "");
  return s;
}

function sanToMove(sanRaw, game) {
  const san = cleanSanToken(sanRaw);
  if (!san) return null;
  const upper = san.toUpperCase();
  if (upper === "O-O" || upper === "0-0") {
    const cfg = game.exportJson();
    const turn = cfg && cfg.turn ? cfg.turn : "white";
    if (turn === "white") return { from: "E1", to: "G1" };
    return { from: "E8", to: "G8" };
  }
  if (upper === "O-O-O" || upper === "0-0-0") {
    const cfg = game.exportJson();
    const turn = cfg && cfg.turn ? cfg.turn : "white";
    if (turn === "white") return { from: "E1", to: "C1" };
    return { from: "E8", to: "C8" };
  }
  const promoMatch = san.match(/=([QRBN])$/i);
  const promoPiece = promoMatch ? promoMatch[1].toUpperCase() : null;
  let core = san;
  if (promoMatch) {
    core = san.slice(0, san.length - promoMatch[0].length);
  }
  const destMatches = core.match(/([a-h][1-8])/gi);
  if (!destMatches || destMatches.length === 0) return null;
  const dest = destMatches[destMatches.length - 1];
  const destLower = dest.toLowerCase();
  const capture = core.includes("x");
  let pieceLetter = core[0];
  let pieceType = "";
  let startIndex = 0;
  if (/[KQRBN]/.test(pieceLetter)) {
    pieceType = pieceLetter;
    startIndex = 1;
  } else {
    pieceType = "P";
    startIndex = 0;
  }
  const destIndex = core.lastIndexOf(dest);
  let between = "";
  if (destIndex > startIndex) {
    between = core.slice(startIndex, destIndex);
    between = between.replace("x", "");
  }
  let fileHint = "";
  let rankHint = "";
  for (const ch of between) {
    if (/[a-h]/.test(ch)) fileHint = ch;
    else if (/[1-8]/.test(ch)) rankHint = ch;
  }
  const cfg = game.exportJson();
  if (!cfg || !cfg.pieces) return null;
  const turn = cfg.turn || "white";
  const movesMap = game.moves();
  const pieces = cfg.pieces;
  const candidates = [];
  for (const from in movesMap) {
    const piece = pieces[from];
    if (!piece) continue;
    const isWhitePiece = piece === piece.toUpperCase();
    const color = isWhitePiece ? "white" : "black";
    if (color !== turn) continue;
    const type = piece.toUpperCase();
    if (pieceType === "P") {
      if (type !== "P") continue;
    } else {
      if (type !== pieceType) continue;
    }
    const targets = movesMap[from] || [];
    targets.forEach(to => {
      if (to.toLowerCase() !== destLower) return;
      const fromFile = from[0].toLowerCase();
      const fromRank = from[1];
      if (fileHint && fromFile !== fileHint) return;
      if (rankHint && fromRank !== rankHint) return;
      const toKey = to.toUpperCase();
      const hasCapture = !!pieces[toKey];
      if (capture && !hasCapture && pieceType !== "P") return;
      candidates.push({ from, to });
    });
  }
  if (!candidates.length) {
    for (const from in movesMap) {
      const targets = movesMap[from] || [];
      targets.forEach(to => {
        if (to.toLowerCase() === destLower) {
          candidates.push({ from, to });
        }
      });
    }
  }
  if (!candidates.length) return null;
  const chosen = candidates[0];
  return { from: chosen.from.toUpperCase(), to: chosen.to.toUpperCase(), promotion: promoPiece };
}

function evaluatePgn(pgnText) {
  if (!pgnInput || !pgnAnalysisList) return;
  const moves = parsePgnMoves(pgnText);
  pgnAnalysisList.innerHTML = "";
  if (!moves.length) {
    const li = document.createElement("li");
    li.textContent = "Keine Züge gefunden.";
    pgnAnalysisList.appendChild(li);
    return;
  }
  testMode = false;
  analysisMode = true;
  engineBusy = false;
  gameOverShown = false;
  hideGameOver();
  resetMovesList();
  clearSelection();
  pendingPromotion = null;
  pgnReplay = [];
  pgnReplayStates = [];
  pgnReplayIndex = -1;
  pgnReplayActive = false;
  engineGame = new Game();
  if (engineGame.exportJson) {
    boardConfig = engineGame.exportJson();
  }
  playerColor = "white";
  colorSelect.value = playerColor;
  renderBoardGrid();
  updateBoard();
  if (boardConfig) {
    pgnReplayStates.push(boardConfig);
  }
  setStatus("PGN-Analyse: " + moves.length + " Halbzüge werden ausgewertet …");
  let moveIndex = 0;
  const maxPlies = moves.length;
  function step() {
    if (!engineGame) {
      setStatus("PGN-Analyse abgebrochen (keine Engineinstanz).");
      return;
    }
    const cfgBefore = engineGame.exportJson ? engineGame.exportJson() : boardConfig;
    if (!cfgBefore) {
      setStatus("PGN-Analyse abgebrochen (keine Stellung verfügbar).");
      return;
    }
    const side = cfgBefore.turn || (moveIndex % 2 === 0 ? "white" : "black");
    const materialBefore = computeMaterial(cfgBefore, side);
    let engineSuggestion = null;
    try {
      const suggestionGame = new Game(cfgBefore);
      const suggestionLevel = 1;
      const suggestionBest = findBestMoveForGame(suggestionGame, suggestionLevel);
      if (suggestionBest && suggestionBest.move) {
        const entries = Object.entries(suggestionBest.move);
        if (entries.length > 0) {
          const [from, to] = entries[0];
          engineSuggestion = { from, to };
        }
      }
    } catch (_) {
    }
    const san = moves[moveIndex];
    const mapped = sanToMove(san, engineGame);
    if (!mapped) {
      const li = document.createElement("li");
      const ply = moveIndex + 1;
      li.textContent = "Zug " + ply + ": \"" + san + "\" konnte nicht interpretiert werden.";
      pgnAnalysisList.appendChild(li);
      updateBoard();
      const finalCfg = engineGame.exportJson ? engineGame.exportJson() : boardConfig;
      const finalStatus = finalCfg && finalCfg.turn ? finalCfg : null;
      if (finalStatus && finalStatus.turn) {
        const sideText2 = finalStatus.turn === "white" ? "Weiß" : "Schwarz";
        setStatus("PGN-Analyse: Stellung nach Partie, " + sideText2 + " am Zug.");
      } else {
        setStatus("PGN-Analyse: Stellung nach Partie geladen.");
      }
      pgnReplayActive = pgnReplayStates.length > 0 && pgnReplay.length > 0;
      pgnReplayIndex = -1;
      return;
    }
    let cfgAfter = null;
    try {
      cfgAfter = engineGame.move(mapped.from, mapped.to);
      boardConfig = cfgAfter;
      if (mapped.promotion) {
        const color = side === "white" ? "white" : "black";
        const pieceSymbol = color === "white" ? mapped.promotion.toUpperCase() : mapped.promotion.toLowerCase();
        engineGame.setPiece(mapped.to, pieceSymbol);
        if (engineGame.exportJson) {
          boardConfig = engineGame.exportJson();
          cfgAfter = boardConfig;
        }
      }
    } catch (_) {
      const li = document.createElement("li");
      const ply = moveIndex + 1;
      li.textContent = "Zug " + ply + ": \"" + san + "\" ist in dieser Stellung nicht legal.";
      pgnAnalysisList.appendChild(li);
      updateBoard();
      const finalCfg = engineGame.exportJson ? engineGame.exportJson() : boardConfig;
      const finalStatus = finalCfg && finalCfg.turn ? finalCfg : null;
      if (finalStatus && finalStatus.turn) {
        const sideText2 = finalStatus.turn === "white" ? "Weiß" : "Schwarz";
        setStatus("PGN-Analyse: Stellung nach Partie, " + sideText2 + " am Zug.");
      } else {
        setStatus("PGN-Analyse: Stellung nach Partie geladen.");
      }
      pgnReplayActive = pgnReplayStates.length > 0 && pgnReplay.length > 0;
      pgnReplayIndex = -1;
      return;
    }
    const materialAfter = computeMaterial(cfgAfter, side);
    const delta = materialAfter - materialBefore;
    const moveNumber = Math.floor(moveIndex / 2) + 1;
    const isWhite = side === "white";
    const prefix = isWhite ? moveNumber + ". " : moveNumber + "... ";
    const sideText = isWhite ? "Weiß" : "Schwarz";
    let verdict = "ok";
    if (delta <= -3) verdict = "grober Fehler";
    else if (delta <= -1) verdict = "Fehler";
    else if (delta < 0) verdict = "leichte Ungenauigkeit";
    else if (delta >= 2) verdict = "sehr guter Zug";
    else if (delta > 0) verdict = "guter Zug";
    const li = document.createElement("li");
    let text = prefix + san + " – " + sideText + ": " + verdict;
    if (delta < 0) {
      text += " (Material verloren)";
    } else if (delta > 0) {
      text += " (Material gewonnen)";
    }
    if (engineSuggestion) {
      const from = engineSuggestion.from.toLowerCase();
      const to = engineSuggestion.to.toLowerCase();
      const sugg = from + "-" + to;
      if (!(from === mapped.from.toLowerCase() && to === mapped.to.toLowerCase())) {
        text += " | Besserer Zug laut Engine: " + sugg;
      }
    }
    const sideAdvText = side === "white" ? "Weiß" : "Schwarz";
    const oppAdvText = side === "white" ? "Schwarz" : "Weiß";
    let advantage = "";
    if (delta > 0) {
      advantage = "Vorteil: " + sideAdvText + " gewinnt ungefähr " + delta + " Bauer(e) Material.";
    } else if (delta < 0) {
      advantage = "Vorteil: " + oppAdvText + " – dieser Zug verliert ungefähr " + Math.abs(delta) + " Bauer(e).";
    } else {
      advantage = "Vorteil: keine klare Materialänderung.";
    }
    let engineExtra = "";
    if (engineSuggestion) {
      const from = engineSuggestion.from.toLowerCase();
      const to = engineSuggestion.to.toLowerCase();
      const sugg = from + "-" + to;
      if (!(from === mapped.from.toLowerCase() && to === mapped.to.toLowerCase())) {
        engineExtra = "Engine bevorzugt " + sugg + ".";
      }
    }
    const explanation = engineExtra ? advantage + " " + engineExtra : advantage;
    pgnReplay.push({
      san,
      from: mapped.from,
      to: mapped.to,
      side,
      engineSuggestion,
      delta,
      verdict,
      explanation
    });
    li.textContent = text;
    pgnAnalysisList.appendChild(li);
    if (cfgAfter) {
      pgnReplayStates.push(cfgAfter);
    }
    moveIndex += 1;
    if (moveIndex >= maxPlies) {
      updateBoard();
      pgnReplayActive = pgnReplayStates.length > 0 && pgnReplay.length > 0;
      pgnReplayIndex = -1;
      setStatus("PGN analysiert. Nutze Zurück/Weiter, um die Partie langsam durchzugehen.");
      return;
    }
    setTimeout(step, 0);
  }
  step();
}

function replayStep(direction) {
  if (!pgnReplayActive || !pgnReplayStates.length) return;
  if (!engineGame) {
    engineGame = new Game(pgnReplayStates[0]);
  }
  let newIndex = pgnReplayIndex + direction;
  if (newIndex < -1) newIndex = -1;
  if (newIndex >= pgnReplay.length) newIndex = pgnReplay.length - 1;
  pgnReplayIndex = newIndex;
  const stateIndex = newIndex + 1;
  const cfg = pgnReplayStates[stateIndex];
  if (!cfg) return;
  engineGame = new Game(cfg);
  boardConfig = cfg;
  playerColor = "white";
  if (colorSelect) colorSelect.value = playerColor;
  updateBoard();
  clearSelection();
  if (newIndex === -1) {
    setStatus("PGN-Replay: Anfangsstellung.");
    return;
  }
  const stepInfo = pgnReplay[newIndex];
  markLastMove(stepInfo.from, stepInfo.to);
  if (stepInfo.engineSuggestion && stepInfo.engineSuggestion.from && stepInfo.engineSuggestion.to) {
    const fromS = stepInfo.engineSuggestion.from;
    const toS = stepInfo.engineSuggestion.to;
    if (!(fromS.toLowerCase() === stepInfo.from.toLowerCase() && toS.toLowerCase() === stepInfo.to.toLowerCase())) {
      markEngineSuggestion(fromS, toS);
    }
  }
  const moveNumber = Math.floor(newIndex / 2) + 1;
  const isWhite = stepInfo.side === "white";
  const prefix = isWhite ? moveNumber + ". " : moveNumber + "... ";
  const sideText = isWhite ? "Weiß" : "Schwarz";
  const statusLine = prefix + stepInfo.san + " – " + sideText + ": " + stepInfo.verdict;
  setStatus(statusLine + " | " + stepInfo.explanation);
}

function showAnalysisHint() {
  if (!analysisMode) {
    setStatus("Analyse-Tipp: Öffne zuerst den Analyse-Modus im Hauptmenü.");
    return;
  }
  const hint = computeAnalysisHint();
  if (!hint) {
    setStatus("Analyse-Tipp: Keine offensichtliche Taktik gefunden.");
    return;
  }
  markLastMove(hint.from, hint.to);
  const moveText = `${hint.from.toLowerCase()}-${hint.to.toLowerCase()}`;
  const sideText = hint.side === "white" ? "Weiß" : "Schwarz";
  if (hint.score > 0) {
    setStatus("Analyse-Tipp (" + sideText + "): Überlege " + moveText + " (schlägt etwas Wertvolles).");
  } else {
    setStatus("Analyse-Tipp (" + sideText + "): Kandidatenzug " + moveText + ".");
  }
}

function markLastMove(from, to) {
  const fromLower = from.toLowerCase();
  const toLower = to.toLowerCase();
  document.querySelectorAll(".square").forEach(el => {
    const sq = el.dataset.square.toLowerCase();
    if (sq === fromLower) el.classList.add("move-from");
    if (sq === toLower) el.classList.add("move-to");
  });
}

function markEngineSuggestion(from, to) {
  const fromLower = from.toLowerCase();
  const toLower = to.toLowerCase();
  document.querySelectorAll(".square").forEach(el => {
    const sq = el.dataset.square.toLowerCase();
    if (sq === fromLower) el.classList.add("engine-sugg-from");
    if (sq === toLower) el.classList.add("engine-sugg-to");
  });
}

function engineMove() {
  if (!engineGame || engineBusy || testMode) return;
  const s = gameStatus();
  if (s && s.isFinished) return;
  engineBusy = true;
  const lichessLevel = computeEngineLevel();
  const aiLevel = computeAiLevelFromLichess();
  const depth = parseInt(depthRange.value, 10) || computeSearchDepthFromLevel();
  const skill = computeStockfishSkill();
  setStatus("Engine denkt ... (Lichess-Level " + lichessLevel + ", Tiefe " + depth + ", Skill " + skill + ")");
  if (!stockfish) {
    initStockfish();
  }
  const fallbackToJsEngine = () => {
    setTimeout(() => {
      let fromSquare = null;
      let destSquare = null;
      try {
        const best = findBestMoveForGame(engineGame, aiLevel);
        if (best && best.move) {
          const entries = Object.entries(best.move);
          if (entries.length > 0) {
            const [from, to] = entries[0];
            const result = engineGame.move(from, to);
            boardConfig = result;
            fromSquare = from;
            destSquare = to;
            const moveText = `${from.toLowerCase()}-${to.toLowerCase()}`;
            appendMoveToList(moveText);
            addUciMove(from, to, null);
          }
        }
      } catch (_) {
      }
      engineBusy = false;
      updateBoard();
      if (fromSquare && destSquare) {
        markLastMove(fromSquare, destSquare);
        playMoveSound();
      }
    }, 20);
  };
  if (!stockfish) {
    fallbackToJsEngine();
    return;
  }
  if (!stockfishReady) {
    stockfishPendingMove = true;
    setStatus("Stockfish wird initialisiert …");
    engineBusy = false;
    return;
  }
  if (stockfishThinking) {
    fallbackToJsEngine();
    return;
  }
  stockfishThinking = true;
  const movesStr = gameMovesUci.length ? " moves " + gameMovesUci.join(" ") : "";
  const positionCmd = "position startpos" + movesStr;
  stockfishBestMoveHandler = (uciMove) => {
    let fromSquare = null;
    let destSquare = null;
    try {
      const from = uciMove.slice(0, 2);
      const to = uciMove.slice(2, 4);
      const promo = uciMove.length >= 5 ? uciMove[4] : null;
      const result = engineGame.move(from.toUpperCase(), to.toUpperCase());
      boardConfig = result;
      fromSquare = from;
      destSquare = to;
      const moveText = `${from.toLowerCase()}-${to.toLowerCase()}`;
      appendMoveToList(moveText);
      addUciMove(from, to, promo);
    } catch (_) {
    }
    engineBusy = false;
    updateBoard();
    if (fromSquare && destSquare) {
      markLastMove(fromSquare, destSquare);
      playMoveSound();
    }
  };
  try {
    stockfish.postMessage("ucinewgame");
    stockfish.postMessage(positionCmd);
    stockfish.postMessage("setoption name Skill Level value " + skill);
    stockfish.postMessage("go depth " + depth);
  } catch (_) {
    stockfishThinking = false;
    fallbackToJsEngine();
  }
}

function newGame() {
  analysisMode = false;
  engineGame = new Game();
  if (engineGame.exportJson) {
    boardConfig = engineGame.exportJson();
  }
  gameMovesUci = [];
  resetMovesList();
  selectedSquare = null;
  legalTargets.clear();
  pendingPromotion = null;
  gameOverShown = false;
  hideGameOver();
  renderBoardGrid();
  updateBoard();
  if (!testMode && playerColor === "black") {
    setTimeout(engineMove, 100);
  }
}

function runTestStep() {
  if (!testMode || !engineGame) {
    testLoopRunning = false;
    setTestModeUI(false);
    return;
  }
  const s = gameStatus();
  if (s && s.isFinished) {
    testLoopRunning = false;
    setTestModeUI(false);
    return;
  }
  engineBusy = true;
  const level = computeEngineLevel();
  setStatus(`Testmodus: Engine denkt ... (Level ${level})`);
  setTimeout(() => {
    try {
      const best = findBestMoveForGame(engineGame, level);
      if (best && best.move) {
        const entries = Object.entries(best.move);
        if (entries.length > 0) {
          const [from, to] = entries[0];
          const result = engineGame.move(from, to);
          boardConfig = result;
          const moveText = `${from.toLowerCase()}-${to.toLowerCase()}`;
          appendMoveToList(moveText);
        }
      }
    } catch (_) {
    }
    engineBusy = false;
    updateBoard();
    const statusNow = gameStatus();
    const gameOverNow = statusNow && statusNow.isFinished;
    if (testMode && !gameOverNow) {
      setTimeout(runTestStep, 150);
    } else {
      testMode = false;
      testLoopRunning = false;
      setTestModeUI(false);
    }
  }, 20);
}

function swapSides() {
  playerColor = playerColor === "white" ? "black" : "white";
  colorSelect.value = playerColor;
  newGame();
}

function startAnalysisMode() {
  testMode = false;
  analysisMode = true;
  engineBusy = false;
  gameOverShown = false;
  hideGameOver();
  resetMovesList();
  clearSelection();
  pendingPromotion = null;
  engineGame = new Game();
  if (engineGame.exportJson) {
    boardConfig = engineGame.exportJson();
  }
  gameMovesUci = [];
  playerColor = "white";
  colorSelect.value = playerColor;
  renderBoardGrid();
  updateBoard();
  setStatus("Analyse-Modus: Du kannst Züge ausprobieren und Tipps holen.");
}

function startRandomTactic() {
  testMode = false;
  analysisMode = false;
  gameOverShown = false;
  hideGameOver();
  resetMovesList();
  clearSelection();
  pendingPromotion = null;
  engineGame = new Game();
  if (engineGame.exportJson) {
    boardConfig = engineGame.exportJson();
  }
  gameMovesUci = [];
  playerColor = "white";
  colorSelect.value = playerColor;
  renderBoardGrid();
  updateBoard();
  engineBusy = true;
  setStatus("Taktikaufgabe: schneller Spieldurchlauf wird berechnet …");
  const plies = 8 + Math.floor(Math.random() * 8);
  let remaining = plies;
  function step() {
    if (!engineGame || remaining <= 0) {
      const s = gameStatus();
      if (s && s.turn) {
        playerColor = s.turn;
        colorSelect.value = playerColor;
        renderBoardGrid();
        updateBoard();
        const sideText = playerColor === "white" ? "Weiß" : "Schwarz";
        setStatus("Taktikaufgabe: " + sideText + " am Zug");
      } else {
        setStatus("Taktikaufgabe: Stellung geladen");
      }
      engineBusy = false;
      return;
    }
    const level = 2;
    try {
      const best = findBestMoveForGame(engineGame, level);
      if (best && best.move) {
        const entries = Object.entries(best.move);
        if (entries.length > 0) {
          const [from, to] = entries[0];
          const result = engineGame.move(from, to);
          boardConfig = result;
          appendMoveToList(`${from.toLowerCase()}-${to.toLowerCase()}`);
          updateBoard();
          markLastMove(from, to);
          playMoveSound();
        }
      }
    } catch (_) {
    }
    remaining -= 1;
    setTimeout(step, 90);
  }
  setTimeout(step, 120);
}

colorSelect.addEventListener("change", () => {
  playerColor = colorSelect.value;
  newGame();
});

depthRange.addEventListener("input", () => {
  depthValue.textContent = depthRange.value;
});

skillRange.addEventListener("input", () => {
  skillValue.textContent = skillRange.value;
  const depth = computeSearchDepthFromLevel();
  depthRange.value = String(depth);
  depthValue.textContent = String(depth);
  const skill = computeStockfishSkill();
  if (stockfish) {
    try {
      stockfish.postMessage("setoption name Skill Level value " + skill);
    } catch (_) {
    }
  }
});

if (newGameBtn) {
  newGameBtn.addEventListener("click", newGame);
}
if (swapSidesBtn) {
  swapSidesBtn.addEventListener("click", swapSides);
}

if (tacticsBtn) {
  tacticsBtn.addEventListener("click", startRandomTactic);
}

if (analysisHintBtn) {
  analysisHintBtn.addEventListener("click", showAnalysisHint);
}

if (pgnAnalyzeBtn) {
  pgnAnalyzeBtn.addEventListener("click", () => {
    if (!pgnInput) return;
    evaluatePgn(pgnInput.value);
  });
}

if (pgnPrevBtn) {
  pgnPrevBtn.addEventListener("click", () => {
    replayStep(-1);
  });
}

if (pgnNextBtn) {
  pgnNextBtn.addEventListener("click", () => {
    replayStep(1);
  });
}

if (menuPlayBtn) {
  menuPlayBtn.addEventListener("click", () => {
    hideMainMenu();
    analysisMode = false;
    playerColor = "white";
    colorSelect.value = playerColor;
    setModeUI("play");
    newGame();
  });
}

if (menuTacticsBtn) {
  menuTacticsBtn.addEventListener("click", () => {
    hideMainMenu();
    setModeUI("tactics");
    startRandomTactic();
  });
}

if (menuAnalysisBtn) {
  menuAnalysisBtn.addEventListener("click", () => {
    hideMainMenu();
    setModeUI("analysis");
    startAnalysisMode();
  });
}

if (backToMenuBtn) {
  backToMenuBtn.addEventListener("click", () => {
    showMainMenu();
  });
}

if (gameOverNewGameBtn) {
  gameOverNewGameBtn.addEventListener("click", () => {
    testMode = false;
    testLoopRunning = false;
    setTestModeUI(false);
    newGame();
  });
}

if (gameOverCloseBtn) {
  gameOverCloseBtn.addEventListener("click", () => {
    hideGameOver();
  });
}

function startTestMode() {
  if (testLoopRunning) return;
  testMode = true;
  gameOverShown = false;
  hideGameOver();
  setTestModeUI(true);
  newGame();
  testLoopRunning = true;
  runTestStep();
}

if (testModeBtn) {
  testModeBtn.addEventListener("click", () => {
    startTestMode();
  });
}

document.addEventListener("keydown", (e) => {
  if (e.altKey && (e.key === "t" || e.key === "T")) {
    startTestMode();
  }
});

promotionButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    if (!pendingPromotion || !engineGame) {
      hidePromotionModal();
      return;
    }
    const choice = btn.dataset.piece;
    const from = pendingPromotion.from;
    const to = pendingPromotion.to;
    const color = pendingPromotion.color;
    try {
      const result = engineGame.move(from, to);
      boardConfig = result;
      const pieceSymbol = color === "white" ? choice.toUpperCase() : choice.toLowerCase();
      engineGame.setPiece(to, pieceSymbol);
      if (engineGame.exportJson) {
        boardConfig = engineGame.exportJson();
      }
      const moveText = `${from.toLowerCase()}-${to.toLowerCase()}=${choice.toUpperCase()}`;
      appendMoveToList(moveText);
      addUciMove(from, to, choice);
    } catch (_) {
    }
    pendingPromotion = null;
    hidePromotionModal();
    updateBoard();
    setTimeout(engineMove, 50);
  });
});

function startLoaderIntro() {
  if (!loaderOverlay || !loaderMiniBoardEl) {
    showMainMenu();
    return;
  }
  loaderOverlay.classList.add("hidden");
  showMainMenu();
}

window.addEventListener("DOMContentLoaded", () => {
  depthValue.textContent = depthRange.value;
  skillValue.textContent = skillRange.value;
  setModeUI("play");
  initStockfish();
  startLoaderIntro();
});
