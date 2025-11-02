/* chess.js
   Module minimal mais complet de logique d'échecs.
   - board[r][c] : chaîne vide "" ou une lettre: KQRBNP (blanc) / kqrbnp (noir)
   - r = 0 (rangée du haut, noir), r = 7 (bas, blanc)
   - fournit : ChessGame class avec méthodes pour générer/apply/undo coups, tester échec/mat.
*/

(function(global){
    // Utility
    function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

    // Move object: {from: {r,c}, to: {r,c}, piece, capture, promotion, castle, enPassant, prevHalfMoveClock, prevEnPassant}
    class ChessGame {
        constructor() {
            this.reset();
        }

        reset() {
            this.board = [
                ["r","n","b","q","k","b","n","r"],
                ["p","p","p","p","p","p","p","p"],
                ["","","","","","","",""],
                ["","","","","","","",""],
                ["","","","","","","",""],
                ["","","","","","","",""],
                ["P","P","P","P","P","P","P","P"],
                ["R","N","B","Q","K","B","N","R"],
            ];
            this.turn = 'w'; // 'w' ou 'b'
            this.castling = { wKing: true, wQueen: true, bKing: true, bQueen: true };
            this.enPassant = null; // {r,c} square target (where a pawn can capture en passant)
            this.halfmoveClock = 0;
            this.fullmoveNumber = 1;
            this.history = []; // stack of moves for undo
        }

        // clone board (deep)
        cloneBoard() {
            return this.board.map(row => row.slice());
        }

        // Helper: get piece color: 'w'|'b'|null
        pieceColor(piece) {
            if (!piece) return null;
            return (piece === piece.toUpperCase()) ? 'w' : 'b';
        }

        // Get all pseudo-legal moves (not yet filtered for leaving king in check)
        generatePseudoLegalMoves() {
            const moves = [];
            const turnColor = this.turn;
            for (let r=0;r<8;r++){
                for (let c=0;c<8;c++){
                    const p = this.board[r][c];
                    if (!p) continue;
                    const color = this.pieceColor(p);
                    if ((color === 'w' && turnColor === 'w') || (color === 'b' && turnColor === 'b')) {
                        this.generatePieceMoves(r,c,moves);
                    }
                }
            }
            // return array of move objects (not yet validated for king safety)
            return moves;
        }

        generatePieceMoves(r,c,movesOut) {
            const p = this.board[r][c];
            if (!p) return;
            const color = this.pieceColor(p);
            const dir = (color === 'w') ? -1 : 1; // blanc monte (r diminue)
            const opponent = (color === 'w') ? 'b' : 'w';
            const pLower = p.toLowerCase();

            // Pawn moves
            if (pLower === 'p') {
                const startRow = (color === 'w') ? 6 : 1;
                // one step
                const r1 = r + dir;
                if (inBounds(r1,c) && this.board[r1][c] === "") {
                    // promotion?
                    if ((color==='w' && r1===0) || (color==='b' && r1===7)) {
                        ['q','r','b','n'].forEach(prom => {
                            movesOut.push({from:{r,c}, to:{r:r1,c}, piece:p, capture:null, promotion: prom.toUpperCase() * 1 ? prom.toUpperCase() : prom });
                            // note: we'll normalize promotion letter case later
                        });
                    } else {
                        movesOut.push({from:{r,c}, to:{r:r1,c}, piece:p});
                    }
                    // two steps
                    const r2 = r + dir*2;
                    if (r === startRow && this.board[r2][c] === "" ) {
                        movesOut.push({from:{r,c}, to:{r:r2,c}, piece:p, doublePawnPush:true});
                    }
                }
                // captures
                for (let dc of [-1,1]) {
                    const rc = r + dir;
                    const cc = c + dc;
                    if (!inBounds(rc,cc)) continue;
                    const target = this.board[rc][cc];
                    if (target && this.pieceColor(target) === opponent) {
                        // promotion?
                        if ((color==='w' && rc===0) || (color==='b' && rc===7)) {
                            ['q','r','b','n'].forEach(prom => {
                                movesOut.push({from:{r,c}, to:{r:rc,c:cc}, piece:p, capture:target, promotion: prom});
                            });
                        } else {
                            movesOut.push({from:{r,c}, to:{r:rc,c:cc}, piece:p, capture:target});
                        }
                    }
                    // en passant
                    if (this.enPassant && this.enPassant.r === rc && this.enPassant.c === cc) {
                        // en passant capture: target is the pawn behind enPassant square
                        const behindR = r;
                        const behindC = cc;
                        const behindPiece = this.board[behindR][behindC];
                        if (behindPiece && this.pieceColor(behindPiece) === opponent && behindPiece.toLowerCase() === 'p') {
                            movesOut.push({from:{r,c}, to:{r:rc,c:cc}, piece:p, capture:behindPiece, enPassant:true});
                        }
                    }
                }
                return;
            }

            // Knight moves
            if (pLower === 'n') {
                const deltas = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
                for (let [dr,dc] of deltas) {
                    const rr = r+dr, cc=c+dc;
                    if (!inBounds(rr,cc)) continue;
                    const target = this.board[rr][cc];
                    if (!target || this.pieceColor(target) !== color) {
                        movesOut.push({from:{r,c}, to:{r:rr,c:cc}, piece:p, capture: target || null});
                    }
                }
                return;
            }

            // Sliding pieces: bishop, rook, queen
            const slide = (dirs) => {
                for (let [dr,dc] of dirs) {
                    let rr=r+dr, cc=c+dc;
                    while (inBounds(rr,cc)) {
                        const t = this.board[rr][cc];
                        if (!t) {
                            movesOut.push({from:{r,c}, to:{r:rr,c:cc}, piece:p});
                        } else {
                            if (this.pieceColor(t) !== color) {
                                movesOut.push({from:{r,c}, to:{r:rr,c:cc}, piece:p, capture:t});
                            }
                            break;
                        }
                        rr += dr; cc += dc;
                    }
                }
            };

            if (pLower === 'b') {
                slide([[-1,-1],[-1,1],[1,-1],[1,1]]);
                return;
            }
            if (pLower === 'r') {
                slide([[-1,0],[1,0],[0,-1],[0,1]]);
                return;
            }
            if (pLower === 'q') {
                slide([[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]);
                return;
            }

            // King moves (including castling)
            if (pLower === 'k') {
                for (let dr=-1; dr<=1; dr++) for (let dc=-1; dc<=1; dc++) {
                    if (dr===0 && dc===0) continue;
                    const rr=r+dr, cc=c+dc;
                    if (!inBounds(rr,cc)) continue;
                    const t = this.board[rr][cc];
                    if (!t || this.pieceColor(t) !== color) {
                        movesOut.push({from:{r,c}, to:{r:rr,c:cc}, piece:p, capture: t || null});
                    }
                }
                // Castling: simplified checks here (we'll fully validate later)
                if (color === 'w' && r===7 && c===4) {
                    // king side
                    if (this.castling.wKing && this.board[7][5]==="" && this.board[7][6]==="") {
                        movesOut.push({from:{r,c}, to:{r:7,c:6}, piece:p, castle:'K'});
                    }
                    // queen side
                    if (this.castling.wQueen && this.board[7][3]==="" && this.board[7][2]==="" && this.board[7][1]==="") {
                        movesOut.push({from:{r,c}, to:{r:7,c:2}, piece:p, castle:'Q'});
                    }
                }
                if (color === 'b' && r===0 && c===4) {
                    if (this.castling.bKing && this.board[0][5]==="" && this.board[0][6]==="") {
                        movesOut.push({from:{r,c}, to:{r:0,c:6}, piece:p, castle:'K'});
                    }
                    if (this.castling.bQueen && this.board[0][3]==="" && this.board[0][2]==="" && this.board[0][1]==="") {
                        movesOut.push({from:{r,c}, to:{r:0,c:2}, piece:p, castle:'Q'});
                    }
                }
                return;
            }
        }

        // Apply a move (assumes already validated). Returns move object pushed to history.
        applyMove(move) {
            // Save snapshot for undo
            const snapshot = {
                board: this.cloneBoard(),
                turn: this.turn,
                castling: Object.assign({}, this.castling),
                enPassant: this.enPassant ? {r:this.enPassant.r, c:this.enPassant.c} : null,
                halfmoveClock: this.halfmoveClock,
                fullmoveNumber: this.fullmoveNumber
            };

            const fromR = move.from.r, fromC = move.from.c;
            const toR = move.to.r, toC = move.to.c;
            const piece = this.board[fromR][fromC];
            move.piece = piece;

            // capture handling (en passant)
            if (move.enPassant) {
                // captured pawn is behind destination
                const capR = fromR;
                const capC = toC;
                move.capture = this.board[capR][capC];
                this.board[capR][capC] = "";
            } else {
                move.capture = this.board[toR][toC] || null;
            }

            // Move piece
            this.board[toR][toC] = this.board[fromR][fromC];
            this.board[fromR][fromC] = "";

            // promotion
            if (move.promotion) {
                const promoLetter = (this.pieceColor(piece) === 'w') ? move.promotion.toUpperCase() : move.promotion.toLowerCase();
                this.board[toR][toC] = promoLetter;
            }

            // castling: move rook
            if (move.castle) {
                if (move.castle === 'K') {
                    // king moved to g-file (col 6), rook from h to f (col 5)
                    const rookR = toR, rookFromC = 7, rookToC = 5;
                    this.board[rookR][rookToC] = this.board[rookR][rookFromC];
                    this.board[rookR][rookFromC] = "";
                } else if (move.castle === 'Q') {
                    const rookR = toR, rookFromC = 0, rookToC = 3;
                    this.board[rookR][rookToC] = this.board[rookR][rookFromC];
                    this.board[rookR][rookFromC] = "";
                }
            }

            // update castling rights
            this.updateCastlingRightsAfterMove(fromR, fromC, toR, toC);

            // update enPassant square
            if (move.doublePawnPush) {
                // square behind pawn (the square that can be captured en passant)
                const epR = (fromR + toR) / 2;
                this.enPassant = { r: epR, c: fromC };
            } else {
                this.enPassant = null;
            }

            // update clocks
            if (piece.toLowerCase() === 'p' || move.capture) {
                this.halfmoveClock = 0;
            } else {
                this.halfmoveClock++;
            }
            if (this.turn === 'b') this.fullmoveNumber++;

            // switch turn
            this.turn = (this.turn === 'w') ? 'b' : 'w';

            // push history
            this.history.push({ snapshot, move });
            return this.history[this.history.length-1];
        }

        updateCastlingRightsAfterMove(fr, fc, tr, tc) {
            // If a rook or king moves or is captured, update rights
            const movedPiece = this.board[tr][tc]; // after move
            // But we will also look at original from square via snapshot maybe; simpler: inspect move coordinates:
            // White king moved
            if (fr === 7 && fc === 4) {
                this.castling.wKing = false; this.castling.wQueen = false;
            }
            // Black king moved
            if (fr === 0 && fc === 4) {
                this.castling.bKing = false; this.castling.bQueen = false;
            }
            // White rook moved or captured
            if ((fr === 7 && fc === 0) || (tr === 7 && tc === 0 && movedPiece && movedPiece.toLowerCase() !== 'r')) {
                this.castling.wQueen = false;
            }
            if ((fr === 7 && fc === 7) || (tr === 7 && tc === 7 && movedPiece && movedPiece.toLowerCase() !== 'r')) {
                this.castling.wKing = false;
            }
            // Black rooks
            if ((fr === 0 && fc === 0) || (tr === 0 && tc === 0 && movedPiece && movedPiece.toLowerCase() !== 'r')) {
                this.castling.bQueen = false;
            }
            if ((fr === 0 && fc === 7) || (tr === 0 && tc === 7 && movedPiece && movedPiece.toLowerCase() !== 'r')) {
                this.castling.bKing = false;
            }
            // Also if a rook is captured at these squares: handled because movedPiece will be replaced? This method is basic but okay for typical moves.
        }

        // Undo last move
        undo() {
            if (this.history.length === 0) return null;
            const entry = this.history.pop();
            const snap = entry.snapshot;
            this.board = snap.board;
            this.turn = snap.turn;
            this.castling = Object.assign({}, snap.castling);
            this.enPassant = snap.enPassant ? {r:snap.enPassant.r, c:snap.enPassant.c} : null;
            this.halfmoveClock = snap.halfmoveClock;
            this.fullmoveNumber = snap.fullmoveNumber;
            return entry.move;
        }

        // Is a given side's king in check?
        isKingInCheck(side) {
            // find king
            let kr=-1,kc=-1;
            const targetKing = (side === 'w') ? 'K' : 'k';
            for (let r=0;r<8;r++) for (let c=0;c<8;c++) if (this.board[r][c] === targetKing) { kr=r; kc=c; }
            if (kr === -1) return false; // shouldn't happen unless king captured
            // enemy moves: we check if any enemy piece attacks (kr,kc)
            const enemy = (side === 'w') ? 'b' : 'w';
            // brute force: generate enemy pseudo moves and see if any target our king square
            for (let r=0;r<8;r++){
                for (let c=0;c<8;c++){
                    const p = this.board[r][c];
                    if (!p) continue;
                    if (this.pieceColor(p) !== enemy) continue;
                    const tempMoves = [];
                    this.generatePieceMoves(r,c,tempMoves);
                    for (const m of tempMoves) {
                        if (m.to.r === kr && m.to.c === kc) return true;
                    }
                }
            }
            return false;
        }

        // Generate all legal moves (filter out those leaving king in check)
        generateLegalMoves() {
            const pseudo = this.generatePseudoLegalMoves();
            const legal = [];
            for (const mv of pseudo) {
                // apply on a copy (fast apply/undo via apply+undo)
                const entry = this.applyMove(Object.assign({}, mv));
                // check king safety for the side that just moved? We need to check opponent attacking own king after move:
                const ourSide = (entry.move && entry.move.piece) ? this.pieceColor(entry.move.piece) : null;
                // After applyMove we switched turn; to check if the side that moved is now in check, we check the opposite of current turn
                const sideThatMoved = (this.turn === 'w') ? 'b' : 'w';
                const inCheck = this.isKingInCheck(sideThatMoved);
                this.undo();
                if (!inCheck) legal.push(mv);
            }
            return legal;
        }

        // Make a move if legal, return true if success
        makeMoveIfLegal(mv) {
            const legals = this.generateLegalMoves();
            // compare by from+to+promotion if any
            for (const l of legals) {
                if (l.from.r===mv.from.r && l.from.c===mv.from.c && l.to.r===mv.to.r && l.to.c===mv.to.c) {
                    // promotion handling: if mv has promotion prefer that
                    if ((!l.promotion && !mv.promotion) || (l.promotion && mv.promotion && l.promotion.toLowerCase() === mv.promotion.toLowerCase())) {
                        return this.applyMove(l);
                    }
                }
            }
            return null;
        }

        // Determine game state: 'ongoing', 'checkmate', 'stalemate'
        getGameState() {
            const legal = this.generateLegalMoves();
            if (legal.length === 0) {
                if (this.isKingInCheck(this.turn)) return 'checkmate';
                else return 'stalemate';
            }
            return 'ongoing';
        }

        // Custom helper to convert board coordinate to FEN-like simple string (for debugging)
        boardToSimpleString() {
            return this.board.map(r=>r.map(c=>c||'.').join('')).join('\n');
        }
    }

    // Export
    global.ChessGame = ChessGame;
})(window);
