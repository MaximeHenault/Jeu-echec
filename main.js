// === CONFIGURATION ===
const SQUARE_SIZE = 80;
const BOARD_SIZE = 8;

// Couleurs du plateau
const LIGHT_SQUARE = 0xf0d9b5;
const DARK_SQUARE = 0xb58863;
const SELECTED_COLOR = 0x7fc97f;
const LEGAL_MOVE_COLOR = 0x90EE90;
const CHECK_COLOR = 0xff0000;

// Mappage des pièces (chess.js → sprites)
const pieceMap = {
  'K': 'wk', 'Q': 'wq', 'R': 'wr', 'B': 'wb', 'N': 'wn', 'P': 'wp',
  'k': 'bk', 'q': 'bq', 'r': 'br', 'b': 'bb', 'n': 'bn', 'p': 'bp'
};

// === VARIABLES GLOBALES ===
let chessGame;
let boardGraphics;
let piecesSprites = [];
let selectedPiece = null;
let legalMovesMarkers = [];

let checkHighlight = null;   // Rectangle sous le roi
let checkBorder = null;      // Bordure animée

let capturedWhite = { p: 0, n: 0, b: 0, r: 0, q: 0 };
let capturedBlack = { p: 0, n: 0, b: 0, r: 0, q: 0 };

let pendingPromotion = null;

// === SCÈNE PHASER ===
class ChessScene extends Phaser.Scene {
  constructor() { super({ key: 'ChessScene' }); }

  preload() {
    const pieces = ['wk','wq','wr','wb','wn','wp','bk','bq','br','bb','bn','bp'];
    pieces.forEach(p => { this.load.image(p, `assets/pieces/${p}.png`); });
  }

  create() {
    chessGame = new ChessGame();
    this.createBoard();
    this.initCapturedSlots();
    this.createPieces();
    this.setupInput();
    updateUI();
  }

  createBoard() {
    boardGraphics = this.add.graphics();
    this.drawBoard();
  }

  drawBoard() {
    boardGraphics.clear();
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const isLight = (r + c) % 2 === 0;
        const color = isLight ? LIGHT_SQUARE : DARK_SQUARE;
        boardGraphics.fillStyle(color);
        boardGraphics.fillRect(c * SQUARE_SIZE, r * SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE);
      }
    }
  }

  initCapturedSlots() {
    const pieceOrder = ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p', 'n', 'n', 'b', 'b', 'r', 'r', 'q'];
    const whiteContainer = document.getElementById('whiteCaptured');
    whiteContainer.innerHTML = '';
    pieceOrder.forEach(pieceType => {
      const slot = document.createElement('div');
      slot.className = 'captured-slot';
      const img = document.createElement('img');
      img.src = `assets/pieces/w${pieceType}.png`;
      img.className = 'captured-piece';
      img.dataset.piece = pieceType;
      slot.appendChild(img);
      whiteContainer.appendChild(slot);
    });

    const blackContainer = document.getElementById('blackCaptured');
    blackContainer.innerHTML = '';
    pieceOrder.forEach(pieceType => {
      const slot = document.createElement('div');
      slot.className = 'captured-slot';
      const img = document.createElement('img');
      img.src = `assets/pieces/b${pieceType}.png`;
      img.className = 'captured-piece';
      img.dataset.piece = pieceType;
      slot.appendChild(img);
      blackContainer.appendChild(slot);
    });

    capturedWhite = { p: 0, n: 0, b: 0, r: 0, q: 0 };
    capturedBlack = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  }

  createPieces() {
    piecesSprites.forEach(row => row.forEach(sprite => sprite && sprite.destroy()));
    piecesSprites = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      piecesSprites[r] = [];
      for (let c = 0; c < BOARD_SIZE; c++) {
        const piece = chessGame.board[r][c];
        if (piece) {
          const spriteKey = pieceMap[piece];
          const sprite = this.add.image(
            c * SQUARE_SIZE + SQUARE_SIZE / 2,
            r * SQUARE_SIZE + SQUARE_SIZE / 2,
            spriteKey
          ).setInteractive({ draggable: true });
          sprite.displayWidth = SQUARE_SIZE * 0.7;
          sprite.displayHeight = SQUARE_SIZE * 0.7;
          sprite.boardPos = { r, c };
          sprite.pieceType = piece;
          piecesSprites[r][c] = sprite;
        } else {
          piecesSprites[r][c] = null;
        }
      }
    }
  }

  setupInput() {
    this.input.on('dragstart', (pointer, gameObject) => {
      const piece = gameObject.pieceType;
      const color = chessGame.pieceColor(piece);
      const currentTurn = chessGame.turn === 'w' ? 'w' : 'b';
      if (color !== currentTurn) return;
      gameObject.displayWidth = SQUARE_SIZE * 0.8;
      gameObject.displayHeight = SQUARE_SIZE * 0.8;
      gameObject.setDepth(100);
      selectedPiece = gameObject;
      this.showLegalMoves(gameObject.boardPos.r, gameObject.boardPos.c);
    });

    this.input.on('drag', (pointer, gameObject, dragX, dragY) => {
      gameObject.x = dragX;
      gameObject.y = dragY;
    });

    this.input.on('dragend', (pointer, gameObject) => {
      this.handleDrop(pointer, gameObject);
    });

    this.input.on('gameobjectdown', (pointer, gameObject) => {
      if (pointer.rightButtonDown()) return;
      const piece = gameObject.pieceType;
      const color = chessGame.pieceColor(piece);
      const currentTurn = chessGame.turn === 'w' ? 'w' : 'b';
      if (color === currentTurn) {
        this.showLegalMoves(gameObject.boardPos.r, gameObject.boardPos.c);
      }
    });

    this.input.on('pointerdown', (pointer) => {
      if (pointer.rightButtonDown()) {
        this.undoMove();
      }
    });
  }

  showLegalMoves(r, c) {
    this.clearLegalMoves();
    const legalMoves = chessGame.generateLegalMoves();
    const movesFromSquare = legalMoves.filter(m => m.from.r === r && m.from.c === c);
    movesFromSquare.forEach(move => {
      const marker = this.add.circle(
        move.to.c * SQUARE_SIZE + SQUARE_SIZE / 2,
        move.to.r * SQUARE_SIZE + SQUARE_SIZE / 2,
        15,
        LEGAL_MOVE_COLOR,
        0.6
      );
      legalMovesMarkers.push(marker);
    });
  }

  clearLegalMoves() {
    legalMovesMarkers.forEach(m => m.destroy());
    legalMovesMarkers = [];
  }

  handleDrop(pointer, sprite) {
    const toC = Math.floor(pointer.x / SQUARE_SIZE);
    const toR = Math.floor(pointer.y / SQUARE_SIZE);
    if (toC < 0 || toC >= BOARD_SIZE || toR < 0 || toR >= BOARD_SIZE) {
      this.resetPiece(sprite);
      return;
    }
    const move = {
      from: { r: sprite.boardPos.r, c: sprite.boardPos.c },
      to: { r: toR, c: toC }
    };
    const piece = sprite.pieceType.toLowerCase();
    if (piece === 'p' && (toR === 0 || toR === 7)) {
      pendingPromotion = { move, sprite, scene: this };
      this.showPromotionPopup(sprite.pieceType[0] === 'w' ? 'white' : 'black');
      return;
    }
    const result = chessGame.makeMoveIfLegal(move);
    if (result) {
      this.handleValidMove(result, sprite, toR, toC);
    } else {
      this.resetPiece(sprite);
    }
    this.clearLegalMoves();
    sprite.setDepth(0);
    selectedPiece = null;
    updateUI();
  }

  showPromotionPopup(color) {
    const overlay = document.getElementById('promotionOverlay');
    const piecesContainer = document.getElementById('promotionPieces');
    piecesContainer.innerHTML = '';
    const pieces = [
      { type: 'q', name: 'Dame' },
      { type: 'r', name: 'Tour' },
      { type: 'b', name: 'Fou' },
      { type: 'n', name: 'Cavalier' }
    ];
    pieces.forEach(p => {
      const pieceDiv = document.createElement('div');
      pieceDiv.className = 'promotion-piece';
      pieceDiv.onclick = () => this.selectPromotion(p.type);
      const img = document.createElement('img');
      const prefix = color === 'white' ? 'w' : 'b';
      img.src = `assets/pieces/${prefix}${p.type}.png`;
      img.alt = p.name;
      pieceDiv.appendChild(img);
      piecesContainer.appendChild(pieceDiv);
    });
    overlay.classList.add('active');
  }

  selectPromotion(promotionType) {
    const overlay = document.getElementById('promotionOverlay');
    overlay.classList.remove('active');
    if (!pendingPromotion) return;
    const { move, sprite, scene } = pendingPromotion;
    move.promotion = promotionType;
    const result = chessGame.makeMoveIfLegal(move);
    if (result) {
      scene.handleValidMove(result, sprite, move.to.r, move.to.c);
    } else {
      scene.resetPiece(sprite);
    }
    scene.clearLegalMoves();
    sprite.setDepth(0);
    selectedPiece = null;
    pendingPromotion = null;
    updateUI();
  }

  handleValidMove(result, sprite, toR, toC) {
    // Capture normale
    if (result.move.capture && !result.move.enPassant) {
      const capturedSprite = piecesSprites[toR][toC];
      if (capturedSprite && capturedSprite !== sprite) {
        this.addToCaptured(result.move.capture);
        capturedSprite.destroy();
      }
    }
    // En passant
    if (result.move.enPassant) {
      const capturedR = sprite.boardPos.r;
      const capturedC = toC;
      const capturedSprite = piecesSprites[capturedR][capturedC];
      if (capturedSprite) {
        this.addToCaptured(result.move.capture);
        capturedSprite.destroy();
        piecesSprites[capturedR][capturedC] = null;
      }
    }
    // Roque
    if (result.move.castle) {
      const rookFromC = result.move.castle === 'K' ? 7 : 0;
      const rookToC = result.move.castle === 'K' ? 5 : 3;
      const rookSprite = piecesSprites[toR][rookFromC];
      if (rookSprite) {
        rookSprite.x = rookToC * SQUARE_SIZE + SQUARE_SIZE / 2;
        rookSprite.boardPos.c = rookToC;
        piecesSprites[toR][rookToC] = rookSprite;
        piecesSprites[toR][rookFromC] = null;
      }
    }
    // Mettre à jour la position
    piecesSprites[sprite.boardPos.r][sprite.boardPos.c] = null;
    sprite.boardPos = { r: toR, c: toC };
    piecesSprites[toR][toC] = sprite;
    // Promotion visuelle
    if (result.move.promotion) {
      const newPiece = chessGame.board[toR][toC];
      sprite.setTexture(pieceMap[newPiece]);
      sprite.pieceType = newPiece;
    }
    sprite.x = toC * SQUARE_SIZE + SQUARE_SIZE / 2;
    sprite.y = toR * SQUARE_SIZE + SQUARE_SIZE / 2;
    sprite.displayWidth = SQUARE_SIZE * 0.7;
    sprite.displayHeight = SQUARE_SIZE * 0.7;
    this.checkGameState();
  }

  resetPiece(sprite) {
    sprite.x = sprite.boardPos.c * SQUARE_SIZE + SQUARE_SIZE / 2;
    sprite.y = sprite.boardPos.r * SQUARE_SIZE + SQUARE_SIZE / 2;
    sprite.displayWidth = SQUARE_SIZE * 0.7;
    sprite.displayHeight = SQUARE_SIZE * 0.7;
  }

  // === VÉRIFICATION ÉCHEC & MAT ===
  checkGameState() {
    // Efface tous les highlight
    if (checkHighlight) { checkHighlight.destroy(); checkHighlight = null; }
    if (checkBorder)    { checkBorder.destroy();    checkBorder = null;    }

    const state = chessGame.getGameState();
    const isInCheck = chessGame.isKingInCheck(chessGame.turn);

    // Highlight du roi
    if (isInCheck) {
      const kingPiece = chessGame.turn === 'w' ? 'K' : 'k';
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          if (chessGame.board[r][c] === kingPiece) {
            checkHighlight = this.add.rectangle(
              c * SQUARE_SIZE + SQUARE_SIZE / 2,
              r * SQUARE_SIZE + SQUARE_SIZE / 2,
              SQUARE_SIZE,
              SQUARE_SIZE,
              CHECK_COLOR,
              0.5
            );
            checkHighlight.setDepth(-1);

            // Border = variable globale
            checkBorder = this.add.rectangle(
              c * SQUARE_SIZE + SQUARE_SIZE / 2,
              r * SQUARE_SIZE + SQUARE_SIZE / 2,
              SQUARE_SIZE - 4,
              SQUARE_SIZE - 4,
              CHECK_COLOR,
              0
            );
            checkBorder.setStrokeStyle(4, CHECK_COLOR, 1);
            checkBorder.setDepth(1);

            this.tweens.add({
              targets: checkBorder,
              scaleX: { from: 0.95, to: 1.05 },
              scaleY: { from: 0.95, to: 1.05 },
              duration: 500,
              yoyo: true,
              repeat: -1,
              ease: 'Sine.easeInOut'
            });
            break;
          }
        }
      }
    }

    // Affichage des messages
    const msgDiv = document.getElementById('gameMessage');
    if (state === 'checkmate') {
      const winner = chessGame.turn === 'w' ? 'Noirs' : 'Blancs';
      msgDiv.textContent = `🏆 Échec & Mat ! Victoire des ${winner} !`;
      msgDiv.className = 'game-message msg-checkmate';
      this.showVictoryPopup(winner);
    } else if (state === 'stalemate') {
      msgDiv.textContent = '🤝 Pat - Match Nul';
      msgDiv.className = 'game-message msg-stalemate';
      this.showDrawPopup();
    } else if (isInCheck) {
      msgDiv.textContent = '⚠️ Échec au Roi !';
      msgDiv.className = 'game-message msg-check';
    } else {
      msgDiv.textContent = '';
      msgDiv.className = 'game-message';
    }
  }

  showVictoryPopup(winner) {
    setTimeout(() => {
      const overlay = document.getElementById('victoryOverlay');
      const title = document.getElementById('victoryTitle');
      const subtitle = document.getElementById('victorySubtitle');
      if (winner === 'Blancs') {
        title.textContent = '⚪ VICTOIRE DES BLANCS !';
        subtitle.textContent = 'Échec et Mat !';
      } else {
        title.textContent = '⚫ VICTOIRE DES NOIRS !';
        subtitle.textContent = 'Échec et Mat !';
      }
      overlay.classList.add('active');
    }, 800);
  }

  showDrawPopup() {
    setTimeout(() => {
      const overlay = document.getElementById('victoryOverlay');
      const title = document.getElementById('victoryTitle');
      const subtitle = document.getElementById('victorySubtitle');
      title.textContent = '🤝 MATCH NUL';
      subtitle.textContent = 'Pat - Aucun coup légal disponible';
      overlay.classList.add('active');
    }, 800);
  }

  addToCaptured(piece) {
    const color = chessGame.pieceColor(piece);
    const pieceType = piece.toLowerCase();
    const containerId = color === 'w' ? 'whiteCaptured' : 'blackCaptured';
    const container = document.getElementById(containerId);
    const counter = color === 'w' ? capturedWhite : capturedBlack;
    const slots = container.querySelectorAll('.captured-piece');
    for (let slot of slots) {
      if (slot.dataset.piece === pieceType && !slot.classList.contains('captured')) {
        slot.classList.add('captured');
        counter[pieceType]++;
        break;
      }
    }
  }

  removeFromCaptured(piece) {
    const color = chessGame.pieceColor(piece);
    const pieceType = piece.toLowerCase();
    const containerId = color === 'w' ? 'whiteCaptured' : 'blackCaptured';
    const container = document.getElementById(containerId);
    const counter = color === 'w' ? capturedWhite : capturedBlack;
    const slots = Array.from(container.querySelectorAll('.captured-piece'));
    for (let i = slots.length - 1; i >= 0; i--) {
      if (slots[i].dataset.piece === pieceType && slots[i].classList.contains('captured')) {
        slots[i].classList.remove('captured');
        counter[pieceType]--;
        break;
      }
    }
  }

  undoMove() {
    const undoneMove = chessGame.undo();
    if (undoneMove) {
      if (undoneMove.capture) {
        this.removeFromCaptured(undoneMove.capture);
      }
      this.createPieces();
      this.clearLegalMoves();
      this.checkGameState();
      updateUI();
    }
  }

  resetGame() {
    chessGame.reset();
    this.createPieces();
    this.clearLegalMoves();
    if (checkHighlight) { checkHighlight.destroy(); checkHighlight = null; }
    if (checkBorder)    { checkBorder.destroy();    checkBorder = null;    }
    this.initCapturedSlots();
    updateUI();
  }
}

// === MISE À JOUR DE L'INTERFACE ===
function updateUI() {
  const turnDiv = document.getElementById('turnIndicator');
  if (chessGame.turn === 'w') {
    turnDiv.textContent = 'Tour des Blancs';
    turnDiv.className = 'turn-indicator turn-white';
  } else {
    turnDiv.textContent = 'Tour des Noirs';
    turnDiv.className = 'turn-indicator turn-black';
  }
}

// === CONFIGURATION PHASER ===
const config = {
  type: Phaser.AUTO,
  width: SQUARE_SIZE * BOARD_SIZE,
  height: SQUARE_SIZE * BOARD_SIZE,
  parent: 'game-container',
  scene: ChessScene,
  backgroundColor: '#2c3e50'
};

const game = new Phaser.Game(config);

// === ÉVÉNEMENTS DES BOUTONS ===
document.getElementById('undoBtn').addEventListener('click', () => {
  game.scene.scenes[0].undoMove();
});
document.getElementById('resetBtn').addEventListener('click', () => {
  if (confirm('Voulez-vous vraiment recommencer une nouvelle partie ?')) {
    game.scene.scenes[0].resetGame();
  }
});

function closeVictoryPopup() {
  document.getElementById('victoryOverlay').classList.remove('active');
}