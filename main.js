// main.js - version corrigée
const TILE_SIZE = 64;
const BOARD_SIZE = TILE_SIZE * 8;
const ASSET_PATH = "assets";

const config = {
  type: Phaser.AUTO,
  width: BOARD_SIZE,
  height: BOARD_SIZE,
  parent: "game-container",
  backgroundColor: "#111",
  scene: { preload, create, update }
};

const game = new Phaser.Game(config);

// Instance logique
const logic = new ChessGame();

let spritesMap = {}; // "r-c" -> sprite
let highlights = [];

function preload() {
  this.load.image("board", `${ASSET_PATH}/board.png`);
  const names = [
    "white_king","white_queen","white_rook","white_bishop","white_knight","white_pawn",
    "black_king","black_queen","black_rook","black_bishop","black_knight","black_pawn"
  ];
  names.forEach(n => this.load.image(n, `${ASSET_PATH}/pieces/${n}.png`));
}

function create() {
  const scene = this;
  scene.add.image(BOARD_SIZE/2, BOARD_SIZE/2, "board");

  // Draw pieces initiales
  drawAllPieces(scene);

  // Ensure draggable set to current pieces
  scene.input.setDraggable(Object.values(spritesMap));

  // Click (selection) : show legal moves for clicked piece, but only if it's that player's piece
  scene.input.on("gameobjectdown", (pointer, gameObject) => {
    // gameObject is the sprite we clicked
    const coords = pixelOrGridToGrid(gameObject); // safe getter
    const piece = logic.board[coords.r][coords.c];
    if (!piece) {
      // nothing here
      return;
    }
    // check color
    const color = logic.pieceColor(piece);
    if ((color === 'w' && logic.turn !== 'w') || (color === 'b' && logic.turn !== 'b')){
      // Not this player's turn -> ignore and snap back
      snapSpriteToGrid(gameObject);
      return;
    }
    // valid selection: show legal moves for that square
    hideHighlights();
    showLegalMovesFor(coords.r, coords.c, scene);
    // store original grid coords on the sprite (in case)
    gameObject.gridR = coords.r;
    gameObject.gridC = coords.c;
  });

  // Drag behaviour
  scene.input.on("dragstart", (pointer, gameObject) => {
    // nothing special yet
  });

  scene.input.on("drag", (pointer, gameObject, x, y) => {
    // clamp inside board
    gameObject.x = Phaser.Math.Clamp(x, 0, BOARD_SIZE);
    gameObject.y = Phaser.Math.Clamp(y, 0, BOARD_SIZE);
  });

  scene.input.on("dragend", (pointer, gameObject) => {
    // compute from square based on stored grid coords (guaranteed present)
    const from = { r: gameObject.gridR, c: gameObject.gridC };
    const to = pixelToGrid(gameObject.x, gameObject.y);

    // Build tentative move
    const tentative = { from: { r: from.r, c: from.c }, to: { r: to.r, c: to.c } };

    // Promotion prompt if necessary
    const movingPiece = logic.board[from.r][from.c];
    if (movingPiece && movingPiece.toLowerCase() === 'p') {
      if ((logic.pieceColor(movingPiece) === 'w' && to.r === 0) || (logic.pieceColor(movingPiece) === 'b' && to.r === 7)) {
        const promo = prompt("Promotion (Q,R,B,N) — tape la lettre (ex: Q) :", "Q");
        if (promo) tentative.promotion = promo[0];
      }
    }

    // try to apply move via engine
    const result = logic.makeMoveIfLegal(tentative);
    if (result) {
      // Success: redraw all pieces from logic.board (clean and redraw)
      clearPieces(scene);
      drawAllPieces(scene);
      hideHighlights();

      // Reapply draggable to new sprites
      scene.input.setDraggable(Object.values(spritesMap));

      // After move, update any UI state (echec, mat...)
      const state = logic.getGameState();
      if (state === 'checkmate') {
        setTimeout(() => alert(`Checkmate! ${(logic.turn === 'w') ? 'Black' : 'White'} wins.`), 30);
      } else if (state === 'stalemate') {
        setTimeout(() => alert("Stalemate (match nul)."), 30);
      } else if (logic.isKingInCheck(logic.turn)) {
        // simple console message; you can highlight king visually later
        console.log(`${logic.turn === 'w'? 'White' : 'Black'} is in check`);
      }
    } else {
      // invalid move -> snap back
      snapSpriteToGrid(gameObject);
      hideHighlights();
    }
  });

  // Right click undo via mouse or the button (UI)
  scene.input.mouse.disableContextMenu();
  scene.input.on('pointerdown', (pointer) => {
    if (pointer.rightButtonDown()) {
      const mv = logic.undo();
      if (mv) {
        clearPieces(scene);
        drawAllPieces(scene);
        scene.input.setDraggable(Object.values(spritesMap));
        hideHighlights();
      }
    }
  });

  // Hook undo button in HTML
  const undoBtn = document.getElementById("undoBtn");
  if (undoBtn) {
    undoBtn.addEventListener("click", () => {
      const mv = logic.undo();
      if (mv) {
        clearPieces(scene);
        drawAllPieces(scene);
        scene.input.setDraggable(Object.values(spritesMap));
        hideHighlights();
      } else {
        alert("Aucun coup à annuler.");
      }
    });
  }
}

function update() {
  // pas d'update intensif requis pour l'instant
}

/* ---------- Helpers UI / mapping ---------- */

function drawAllPieces(scene) {
  // Destroy old if any
  clearPieces(scene);
  spritesMap = {};

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = logic.board[r][c];
      if (!p) continue;
      const key = pieceToSpriteKey(p);
      const x = c * TILE_SIZE + TILE_SIZE / 2;
      const y = r * TILE_SIZE + TILE_SIZE / 2;
      const s = scene.add.image(x, y, key).setInteractive();
      s.setDisplaySize(48, 48);
      // store grid coords on sprite for quick access when dragging
      s.gridR = r;
      s.gridC = c;
      // store color if useful
      s._color = logic.pieceColor(p); // 'w' or 'b'
      spritesMap[`${r}-${c}`] = s;
    }
  }
}

function clearPieces(scene) {
  for (const k in spritesMap) {
    const sp = spritesMap[k];
    if (sp && sp.destroy) sp.destroy();
  }
  spritesMap = {};
}

function pieceToSpriteKey(p) {
  const map = {
    "K": "white_king","Q":"white_queen","R":"white_rook","B":"white_bishop","N":"white_knight","P":"white_pawn",
    "k":"black_king","q":"black_queen","r":"black_rook","b":"black_bishop","n":"black_knight","p":"black_pawn"
  };
  return map[p];
}

function pixelToGrid(x, y) {
  const c = Math.floor(x / TILE_SIZE);
  const r = Math.floor(y / TILE_SIZE);
  return { r: Phaser.Math.Clamp(r, 0, 7), c: Phaser.Math.Clamp(c, 0, 7) };
}

function pixelOrGridToGrid(spriteOrX) {
  // if argument is a sprite, use sprite.gridR/gridC; otherwise assume {x,y}
  if (spriteOrX && spriteOrX.gridR !== undefined) {
    return { r: spriteOrX.gridR, c: spriteOrX.gridC };
  }
  // fallback to reading x/y
  return pixelToGrid(spriteOrX.x, spriteOrX.y);
}

function snapSpriteToGrid(sprite) {
  // snap visually and keep grid coords
  sprite.x = sprite.gridC * TILE_SIZE + TILE_SIZE / 2;
  sprite.y = sprite.gridR * TILE_SIZE + TILE_SIZE / 2;
}

// Highlights: show legal moves for piece at r,c (green dots)
function showLegalMovesFor(r, c, scene) {
  hideHighlights();
  const legal = logic.generateLegalMoves();
  for (const mv of legal) {
    if (mv.from.r === r && mv.from.c === c) {
      const hx = mv.to.c * TILE_SIZE + TILE_SIZE / 2;
      const hy = mv.to.r * TILE_SIZE + TILE_SIZE / 2;
      // small semi-transparent circle
      const dot = scene.add.circle(hx, hy, 12, 0x00aa00, 0.45);
      highlights.push(dot);
    }
  }
}

function hideHighlights() {
  highlights.forEach(h => h && h.destroy && h.destroy());
  highlights = [];
}
