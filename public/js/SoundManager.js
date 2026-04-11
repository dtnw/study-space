/**
 * SoundManager.js – retro 8-bit sound effects via Web Audio API.
 */
(function () {
  const PRESETS = {
    click:    { freq: 520,  dur: 0.05, type: 'square',   vol: 0.04 },
    sit:      { freq: [523, 659, 784], dur: 0.12, type: 'triangle', vol: 0.05 },
    standup:  { freq: 392,  dur: 0.12, type: 'triangle', vol: 0.04 },
    complete: { freq: [523, 659, 784, 1047], dur: 0.08, type: 'square', vol: 0.04 },
    focus:    { freq: 880,  dur: 0.3,  type: 'sine',     vol: 0.06 },
    brk:      { freq: 660,  dur: 0.4,  type: 'sine',     vol: 0.06 },
    pomo:     { freq: [523, 659, 784, 1047], dur: 0.1, type: 'sine', vol: 0.06 },
    coin:     { freq: [784, 988],  dur: 0.1,  type: 'square',   vol: 0.05 },
    cheer:    { freq: [523, 659, 784, 1047, 1319, 1047, 1319, 1568], dur: 0.1, type: 'sine', vol: 0.07 },
  };

  function _beep(freq, dur, type, vol) {
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch (_) {}
  }

  window.SoundManager = {
    play(key) {
      const p = PRESETS[key];
      if (!p) return;
      if (Array.isArray(p.freq)) {
        p.freq.forEach((f, i) => {
          setTimeout(() => _beep(f, p.dur, p.type, p.vol), i * (p.dur * 900));
        });
      } else {
        _beep(p.freq, p.dur, p.type, p.vol);
      }
    },
  };
})();
