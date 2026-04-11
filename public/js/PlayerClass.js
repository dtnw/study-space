/**
 * PlayerClass.js – local player data (name, gender, coins).
 * Coins persist in localStorage between sessions.
 */
(function () {
  let _name   = '';
  let _gender = 'male';
  let _coins  = parseInt(localStorage.getItem('ss_coins') || '0', 10);

  function _updateDisplay() {
    const el = document.getElementById('coin-count');
    if (el) el.textContent = `🪙 ${_coins}`;
  }

  window.PlayerClass = {
    init(name, gender) {
      _name   = name   || 'Player';
      _gender = gender || 'male';
      _updateDisplay();
    },
    getName()  { return _name; },
    getGender(){ return _gender; },
    getCoins() { return _coins; },
    addCoins(n) {
      _coins += n;
      localStorage.setItem('ss_coins', _coins);
      _updateDisplay();
    },
  };
})();
