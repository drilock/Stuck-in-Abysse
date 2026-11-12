// Fixed-timestep loop: deterministic updates at 60 Hz, render once per animation frame.
export function startLoop(update, render, step = 1 / 60) {
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25; // avoid spiral of death after tab switch
    acc += dt;
    while (acc >= step) {
      update(step);
      acc -= step;
    }
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
