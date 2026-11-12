import { Game } from './game/game.js';
import { startLoop } from './engine/loop.js';

const canvas = document.getElementById('game');
const game = new Game(canvas);
canvas.focus();
startLoop((dt) => game.update(dt), () => game.render());

// Handy for debugging in the console
window.__game = game;
