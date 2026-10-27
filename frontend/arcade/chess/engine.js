(function(root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ChessEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const STANDARD_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const LETTERS = ' PNBRQK';
  const KNIGHT = [-33, -31, -18, -14, 14, 18, 31, 33];
  const BISHOP = [-17, -15, 15, 17];
  const ROOK = [-16, -1, 1, 16];
  const KING = BISHOP.concat(ROOK);
  const PROMOTIONS = [5, 4, 3, 2];

  function rng(seed) {
    let a = seed >>> 0;
    return function() {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function squareName(file, rank) {
    if (!Number.isInteger(file) || !Number.isInteger(rank) || file < 0 || file > 7 || rank < 0 || rank > 7) return null;
    return String.fromCharCode(97 + file) + (rank + 1);
  }

  function parseSquare(name) {
    if (typeof name !== 'string' || !/^[a-h][1-8]$/.test(name)) return null;
    return { file: name.charCodeAt(0) - 97, rank: Number(name[1]) - 1 };
  }

  function sq(name) {
    const parsed = parseSquare(name);
    return parsed ? parsed.rank * 16 + parsed.file : -1;
  }

  function nameOf(index) {
    return squareName(index & 7, index >> 4);
  }

  function side(piece) {
    return piece > 0 ? 1 : -1;
  }

  function label(piece) {
    return piece ? (piece > 0 ? 'w' : 'b') + LETTERS[Math.abs(piece)] : null;
  }

  function start960(number) {
    if (!Number.isInteger(number) || number < 0 || number > 959) throw new RangeError('Invalid Chess960 position');
    let n = number;
    const row = Array(8).fill('');
    row[(n % 4) * 2 + 1] = 'B';
    n = Math.floor(n / 4);
    row[(n % 4) * 2] = 'B';
    n = Math.floor(n / 4);
    let empty = row.map((p, i) => p ? -1 : i).filter(i => i >= 0);
    row[empty[n % 6]] = 'Q';
    n = Math.floor(n / 6);
    empty = row.map((p, i) => p ? -1 : i).filter(i => i >= 0);
    const pairs = [];
    for (let a = 0; a < 4; a++) {
      for (let b = a + 1; b < 5; b++) pairs.push([a, b]);
    }
    for (const i of pairs[n]) row[empty[i]] = 'N';
    empty = row.map((p, i) => p ? -1 : i).filter(i => i >= 0);
    row[empty[0]] = 'R';
    row[empty[1]] = 'K';
    row[empty[2]] = 'R';
    const back = row.join('');
    const rights = number === 518 ? 'KQkq' : String.fromCharCode(65 + empty[2], 65 + empty[0], 97 + empty[2], 97 + empty[0]);
    return back.toLowerCase() + '/pppppppp/8/8/8/8/PPPPPPPP/' + back + ' w ' + rights + ' - 0 1';
  }

  class Game {
    constructor(options = {}) {
      this.variant = options.variant === undefined ? 'standard' : options.variant;
      if (!['standard', 'chess960'].includes(this.variant)) throw new RangeError('Invalid variant');
      this.maxPlies = options.maxPlies === undefined ? 400 : options.maxPlies;
      if (!Number.isInteger(this.maxPlies) || this.maxPlies < 1) throw new RangeError('Invalid maxPlies');
      this._board = new Int8Array(128);
      this._kings = { 1: -1, '-1': -1 };
      this._rights = [];
      this._ply = 0;
      this._history = [];
      this._lastMove = null;
      this._forced = null;
      this._readFen(options.fen === undefined ? (this.variant === 'chess960' ? start960(options.position960 === undefined ? 518 : options.position960) : STANDARD_FEN) : options.fen);
      this._repetitions = new Map([[this._key(), 1]]);
    }

    _readFen(fen) {
      if (typeof fen !== 'string') throw new TypeError('FEN must be a string');
      const fields = fen.trim().split(/\s+/);
      if (fields.length !== 6 || !/^[wb]$/.test(fields[1]) || !/^\d+$/.test(fields[4]) || !/^[1-9]\d*$/.test(fields[5])) throw new Error('Invalid FEN');
      const rows = fields[0].split('/');
      if (rows.length !== 8) throw new Error('Invalid FEN board');
      for (let r = 0; r < 8; r++) {
        let file = 0;
        for (const ch of rows[r]) {
          if (/^[1-8]$/.test(ch)) file += Number(ch);
          else {
            const type = LETTERS.indexOf(ch.toUpperCase());
            if (type < 1 || file > 7) throw new Error('Invalid FEN piece');
            const piece = (ch === ch.toUpperCase() ? 1 : -1) * type;
            const index = (7 - r) * 16 + file++;
            this._board[index] = piece;
            if (type === 6) {
              if (this._kings[side(piece)] !== -1) throw new Error('Duplicate king');
              this._kings[side(piece)] = index;
            }
          }
        }
        if (file !== 8) throw new Error('Invalid FEN rank');
      }
      if (this._kings[1] < 0 || this._kings[-1] < 0) throw new Error('Missing king');
      this._side = fields[1] === 'w' ? 1 : -1;
      this._halfmove = Number(fields[4]);
      this._number = Number(fields[5]);
      if (!Number.isSafeInteger(this._halfmove) || !Number.isSafeInteger(this._number)) throw new Error('Invalid FEN clocks');
      this._ep = fields[3] === '-' ? -1 : sq(fields[3]);
      if (fields[3] !== '-' && (this._ep < 0 || (this._ep >> 4) !== (this._side === 1 ? 5 : 2) || this._board[this._ep])) throw new Error('Invalid en passant square');
      if (fields[2] !== '-') {
        const valid = this.variant === 'standard' ? /^[KQkq]+$/ : /^[KQkqA-Ha-h]+$/;
        if (!valid.test(fields[2])) throw new Error('Invalid castling rights');
        for (const ch of fields[2]) {
          const color = ch === ch.toUpperCase() ? 1 : -1;
          const k = this._kings[color];
          const upper = ch.toUpperCase();
          let file;
          if (upper === 'K' || upper === 'Q') {
            file = upper === 'K' ? 7 : 0;
            if (this.variant === 'chess960') {
              const rooks = [];
              for (let f = 0; f < 8; f++) {
                if (this._board[(color === 1 ? 0 : 112) + f] === color * 4 && (upper === 'K' ? f > (k & 7) : f < (k & 7))) rooks.push(f);
              }
              if (!rooks.length) throw new Error('Missing castling rook');
              file = upper === 'K' ? Math.max(...rooks) : Math.min(...rooks);
            }
          } else file = upper.charCodeAt(0) - 65;
          const r = (color === 1 ? 0 : 112) + file;
          if ((k >> 4) !== (color === 1 ? 0 : 7) || this._board[r] !== color * 4 || r === k || (this.variant === 'standard' && (k & 7) !== 4)) throw new Error('Invalid castling pieces');
          if (this._rights.some(right => right.color === color && (right.r > right.k) === (r > k))) throw new Error('Duplicate castling right');
          this._rights.push({ color, k, r });
        }
      }
    }

    get turn() { return this._side === 1 ? 'w' : 'b'; }
    get ply() { return this._ply; }
    get moveNumber() { return this._number; }
    get halfmoveClock() { return this._halfmove; }
    get history() { return this._history.map(entry => ({ ...entry })); }
    get lastMove() { return this._lastMove ? { ...this._lastMove } : null; }

    board() {
      return Array.from({ length: 8 }, (_, row) => Array.from({ length: 8 }, (_, file) => label(this._board[(7 - row) * 16 + file])));
    }

    fen() {
      const rows = [];
      for (let rank = 7; rank >= 0; rank--) {
        let row = '';
        let empty = 0;
        for (let file = 0; file < 8; file++) {
          const piece = this._board[rank * 16 + file];
          if (!piece) empty++;
          else {
            if (empty) row += empty;
            empty = 0;
            const ch = LETTERS[Math.abs(piece)];
            row += piece > 0 ? ch : ch.toLowerCase();
          }
        }
        rows.push(row + (empty || ''));
      }
      let rights = '';
      for (const color of [1, -1]) {
        for (const kingside of [true, false]) {
          const right = this._rights.find(r => r.color === color && (r.r > r.k) === kingside);
          if (!right) continue;
          let ch = this.variant === 'standard' ? (kingside ? 'K' : 'Q') : String.fromCharCode(65 + (right.r & 7));
          if (color === -1) ch = ch.toLowerCase();
          rights += ch;
        }
      }
      return [rows.join('/'), this.turn, rights || '-', this._ep < 0 ? '-' : nameOf(this._ep), this._halfmove, this._number].join(' ');
    }

    _attacked(target, by) {
      const board = this._board;
      for (const d of [by * 16 - 1, by * 16 + 1]) {
        const from = target - d;
        if (!(from & 0x88) && board[from] === by) return true;
      }
      for (const d of KNIGHT) {
        const from = target + d;
        if (!(from & 0x88) && board[from] === by * 2) return true;
      }
      for (const d of KING) {
        let from = target + d;
        let distance = 1;
        while (!(from & 0x88)) {
          const piece = board[from];
          if (piece) {
            if (side(piece) === by) {
              const type = Math.abs(piece);
              if ((distance === 1 && type === 6) || type === 5 || (BISHOP.includes(d) ? type === 3 : type === 4)) return true;
            }
            break;
          }
          from += d;
          distance++;
        }
      }
      return false;
    }

    inCheck() {
      return this._attacked(this._kings[this._side], -this._side);
    }

    _addPawn(moves, from, to, ep = false) {
      if ((to >> 4) === 0 || (to >> 4) === 7) {
        for (const p of PROMOTIONS) moves.push({ f: from, t: to, p });
      } else moves.push({ f: from, t: to, ep });
    }

    _canCastle(right) {
      const board = this._board;
      const { k, r, color } = right;
      const base = color === 1 ? 0 : 112;
      const kt = base + (r > k ? 6 : 2);
      const rt = base + (r > k ? 5 : 3);
      if (board[k] !== color * 6 || board[r] !== color * 4 || this._attacked(k, -color)) return false;
      for (const [from, to] of [[k, kt], [r, rt]]) {
        for (let s = Math.min(from, to); s <= Math.max(from, to); s++) {
          if (s !== k && s !== r && board[s]) return false;
        }
      }
      // Remove the king's shielding; the final rook layout is checked by make/unmake.
      board[k] = 0;
      let safe = true;
      const step = Math.sign(kt - k);
      if (step) {
        for (let s = k + step; s !== kt; s += step) {
          if (this._attacked(s, -color)) { safe = false; break; }
        }
      }
      board[k] = color * 6;
      return safe;
    }

    _pseudo() {
      const moves = [];
      const board = this._board;
      const color = this._side;
      for (let from = 0; from < 128; from++) {
        if (from & 0x88) { from += 7; continue; }
        const piece = board[from];
        if (!piece || side(piece) !== color) continue;
        const type = Math.abs(piece);
        if (type === 1) {
          const step = color * 16;
          const to = from + step;
          if (!(to & 0x88) && !board[to]) {
            this._addPawn(moves, from, to);
            if ((from >> 4) === (color === 1 ? 1 : 6) && !board[to + step]) moves.push({ f: from, t: to + step });
          }
          for (const d of [step - 1, step + 1]) {
            const dest = from + d;
            if (dest & 0x88) continue;
            if (board[dest] && side(board[dest]) === -color && Math.abs(board[dest]) !== 6) this._addPawn(moves, from, dest);
            else if (dest === this._ep && !board[dest] && board[dest - step] === -color) this._addPawn(moves, from, dest, true);
          }
          continue;
        }
        const directions = type === 2 ? KNIGHT : type === 3 ? BISHOP : type === 4 ? ROOK : KING;
        for (const d of directions) {
          for (let to = from + d; !(to & 0x88); to += d) {
            const target = board[to];
            if (target && side(target) === color) break;
            if (Math.abs(target) !== 6) moves.push({ f: from, t: to });
            if (target || type === 2 || type === 6) break;
          }
        }
      }
      for (const right of this._rights) {
        if (right.color === color && this._canCastle(right)) moves.push({ f: right.k, t: right.r, castle: right });
      }
      return moves;
    }

    _make(move) {
      const board = this._board;
      const piece = board[move.f];
      const color = this._side;
      const undo = { squares: [], rights: this._rights, ep: this._ep, halfmove: this._halfmove, number: this._number, king: this._kings[color], capture: 0 };
      const put = (index, value) => {
        if (!undo.squares.some(entry => entry[0] === index)) undo.squares.push([index, board[index]]);
        board[index] = value;
      };
      if (move.castle) {
        const base = color === 1 ? 0 : 112;
        const kingside = move.t > move.f;
        put(move.f, 0);
        put(move.t, 0);
        put(base + (kingside ? 6 : 2), color * 6);
        put(base + (kingside ? 5 : 3), color * 4);
        this._kings[color] = base + (kingside ? 6 : 2);
      } else {
        undo.capture = board[move.t];
        put(move.f, 0);
        put(move.t, color * (move.p || Math.abs(piece)));
        if (move.ep) {
          const captured = move.t - color * 16;
          undo.capture = board[captured];
          put(captured, 0);
        }
        if (Math.abs(piece) === 6) this._kings[color] = move.t;
      }
      this._rights = this._rights.filter(r => !(r.color === color && Math.abs(piece) === 6) && r.r !== move.f && r.r !== move.t);
      this._ep = Math.abs(piece) === 1 && Math.abs(move.t - move.f) === 32 ? (move.f + move.t) / 2 : -1;
      this._halfmove = Math.abs(piece) === 1 || undo.capture ? 0 : this._halfmove + 1;
      if (color === -1) this._number++;
      this._side = -color;
      return undo;
    }

    _unmake(undo) {
      this._side = -this._side;
      for (const [index, piece] of undo.squares) this._board[index] = piece;
      this._kings[this._side] = undo.king;
      this._rights = undo.rights;
      this._ep = undo.ep;
      this._halfmove = undo.halfmove;
      this._number = undo.number;
    }

    _legal() {
      const legal = [];
      const color = this._side;
      for (const move of this._pseudo()) {
        const undo = this._make(move);
        const safe = !this._attacked(this._kings[color], -color);
        this._unmake(undo);
        if (safe) legal.push(move);
      }
      return legal;
    }

    _uci(move) {
      return nameOf(move.f) + nameOf(move.t) + (move.p ? LETTERS[move.p].toLowerCase() : '');
    }

    legalMoves() {
      return this._legal().map(move => this._uci(move)).sort();
    }

    _key() {
      const fields = this.fen().split(' ');
      if (this._ep >= 0 && !this._legal().some(move => move.ep)) fields[3] = '-';
      return fields.slice(0, 4).join(' ');
    }

    _insufficient() {
      const minors = [];
      for (let s = 0; s < 128; s++) {
        if (s & 0x88) { s += 7; continue; }
        const p = Math.abs(this._board[s]);
        if (!p || p === 6) continue;
        if (p !== 2 && p !== 3) return false;
        minors.push({ p, color: side(this._board[s]), squareColor: ((s & 7) + (s >> 4)) % 2 });
      }
      if (minors.length < 2) return true;
      return minors.length === 2 && minors.every(m => m.p === 3) && minors[0].color !== minors[1].color && minors[0].squareColor === minors[1].squareColor;
    }

    status() {
      if (this._forced) return { ...this._forced };
      const moves = this._legal();
      if (!moves.length) {
        if (this.inCheck()) return { over: true, result: this._side === 1 ? '0-1' : '1-0', reason: 'checkmate' };
        return { over: true, result: '1/2-1/2', reason: 'stalemate' };
      }
      let reason = null;
      if ((this._repetitions.get(this._key()) || 0) >= 3) reason = 'threefold';
      else if (this._halfmove >= 100) reason = 'fifty-move';
      else if (this._insufficient()) reason = 'insufficient';
      else if (this._ply >= this.maxPlies) reason = 'max-plies';
      return { over: reason !== null, result: reason ? '1/2-1/2' : null, reason };
    }

    _san(move, legal) {
      if (move.castle) return move.t > move.f ? 'O-O' : 'O-O-O';
      const type = Math.abs(this._board[move.f]);
      const capture = Boolean(this._board[move.t] || move.ep);
      let san = type === 1 ? (capture ? nameOf(move.f)[0] : '') : LETTERS[type];
      if (type !== 1) {
        const rivals = legal.filter(other => !other.castle && other.f !== move.f && other.t === move.t && Math.abs(this._board[other.f]) === type);
        if (rivals.length) {
          if (!rivals.some(other => (other.f & 7) === (move.f & 7))) san += nameOf(move.f)[0];
          else if (!rivals.some(other => (other.f >> 4) === (move.f >> 4))) san += nameOf(move.f)[1];
          else san += nameOf(move.f);
        }
      }
      return san + (capture ? 'x' : '') + nameOf(move.t) + (move.p ? '=' + LETTERS[move.p] : '');
    }

    move(uci) {
      if (typeof uci !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return { ok: false, error: 'Invalid UCI move' };
      if (this.status().over) return { ok: false, error: 'Game is over' };
      const legal = this._legal();
      let selected = legal.find(move => this._uci(move) === uci);
      if (!selected && this.variant === 'standard' && /^(e1[gc]1|e8[gc]8)$/.test(uci)) {
        selected = legal.find(move => move.castle && nameOf(move.f) === uci.slice(0, 2) && (move.t > move.f ? 'g' : 'c') === uci[2]);
      }
      if (!selected) return { ok: false, error: 'Illegal move' };
      let san = this._san(selected, legal);
      const undo = this._make(selected);
      this._ply++;
      const check = this.inCheck();
      const mate = check && this._legal().length === 0;
      san += mate ? '#' : check ? '+' : '';
      const key = this._key();
      this._repetitions.set(key, (this._repetitions.get(key) || 0) + 1);
      this._lastMove = { from: nameOf(selected.f), to: nameOf(selected.t) };
      this._history.push({ uci: this._uci(selected), san, fen: this.fen() });
      return { ok: true, san, capture: label(undo.capture), check, mate, castle: selected.castle ? (selected.t > selected.f ? 'O-O' : 'O-O-O') : null, promotion: selected.p ? LETTERS[selected.p].toLowerCase() : null };
    }

    forfeit(color, detail) {
      if (!['w', 'b'].includes(color)) throw new RangeError('Invalid color');
      if (!this.status().over) this._forced = { over: true, result: color === 'w' ? '0-1' : '1-0', reason: 'forfeit', detail: String(detail === undefined ? 'Bot failed' : detail) };
      return this.status();
    }

    botState() {
      return { variant: this.variant, fen: this.fen(), board: this.board(), turn: this.turn, you: this.turn, legalMoves: this.legalMoves(), history: this._history.map(entry => entry.uci), ply: this.ply, moveNumber: this.moveNumber, halfmoveClock: this.halfmoveClock, inCheck: this.inCheck(), timeLimitMs: 1000 };
    }

    clone() {
      const copy = new Game({ fen: this.fen(), variant: this.variant, maxPlies: this.maxPlies });
      copy._ply = this._ply;
      copy._history = this.history;
      copy._lastMove = this.lastMove;
      copy._forced = this._forced ? { ...this._forced } : null;
      copy._repetitions = new Map(this._repetitions);
      return copy;
    }
  }

  function create(options) {
    return new Game(options);
  }

  function perft(fen, depth, variant = 'standard') {
    if (!Number.isInteger(depth) || depth < 0) throw new RangeError('Invalid depth');
    const game = create({ fen, variant });
    function visit(remaining) {
      if (!remaining) return 1;
      const moves = game._legal();
      if (remaining === 1) return moves.length;
      let count = 0;
      for (const move of moves) {
        const undo = game._make(move);
        count += visit(remaining - 1);
        game._unmake(undo);
      }
      return count;
    }
    return visit(depth);
  }

  return { create, perft, start960, STANDARD_FEN, rng, squareName, parseSquare };
});
