import { Renderer } from '../engine/renderer.js';
import { Input } from '../engine/input.js';
import { initSprites } from '../engine/sprites.js';
import { setTheme } from '../engine/palette.js';
import { AudioSystem } from '../audio/audio.js';
import { loadSave, persist } from './progression.js';
import { Starfield } from './stars.js';
import { PlayScene } from './play.js';
import { MenuScene, HangarScene, GameOverScene } from '../ui/screens.js';

// Owns shared systems and a small scene stack (menu, play, upgrades, settings, game over).
export class Game {
  constructor(canvas) {
    this.save = loadSave();
    setTheme(this.save.settings.theme);
    initSprites();
    this.r = new Renderer(canvas);
    this.input = new Input(canvas);
    this.audio = new AudioSystem(this.save.settings);
    this.input.onFirstInteraction = () => this.audio.unlock();
    this.stars = new Starfield();
    this.scenes = [];
    this.setScene(new MenuScene(this));
    window.addEventListener('pagehide', () => persist(this.save));
    document.addEventListener('visibilitychange', () => {
      const top = this.top;
      if (document.hidden && top instanceof PlayScene && !top.paused && top.phase !== 'dead') top.openPause();
    });
  }

  applyTheme(name) {
    this.save.settings.theme = name;
    setTheme(name);
    initSprites(); // sprites are baked into canvases with the palette
    persist(this.save);
  }

  get top() {
    return this.scenes[this.scenes.length - 1];
  }

  setScene(s) {
    this.scenes = [s];
  }

  push(s) {
    this.scenes.push(s);
  }

  pop() {
    if (this.scenes.length > 1) this.scenes.pop();
    this.top.resume?.();
  }

  startGame() {
    this.setScene(new PlayScene(this));
  }

  toMenu() {
    this.setScene(new MenuScene(this));
  }

  openHangar(fromGame, deposited = 0) {
    this.push(new HangarScene(this, fromGame, deposited));
  }

  gameOver(result) {
    this.setScene(new GameOverScene(this, result));
  }

  update(dt) {
    this.top.update(dt);
    this.input.endStep();
  }

  render() {
    this.top.render(this.r);
  }
}
