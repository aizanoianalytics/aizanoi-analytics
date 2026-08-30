/** Private Calculator implementation. Shared services arrive only as capabilities. */
export async function mountCalculator({ container, capabilities }) {
  const { sound } = capabilities;
  container.innerHTML = `
  <div class="az-app-shell"><div class="az-app-toolbar"><strong>Calculator</strong><span class="az-system-spacer"></span><span class="az-app-caption">Standard</span></div>
  <div class="az-calc">
    <div class="az-calc-display" data-calc-display role="status" aria-live="polite">0</div>
    <div class="az-calc-modes"><span data-calc-memory-indicator></span><span>Standard</span></div>
    <div class="az-calc-keys" role="group" aria-label="Calculator keypad">
      ${[['MC','m'],['MR','r'],['MS','s'],['M+','p'],['Back','back'],['CE','ce'],['C','c'],['±','neg'],['√','sqrt']]
        .map(([label, action]) => `<button class="az-calc-key az-calc-key--fn" type="button" data-calc="${action}">${label}</button>`).join('')}
      ${['7','8','9','/','4','5','6','*','1','2','3','-','0','.','+'].map((key) => {
        const label = key === '*' ? '×' : key === '/' ? '÷' : key;
        return `<button class="az-calc-key" type="button" data-calc="${label}">${label}</button>`;
      }).join('')}
      <button class="az-calc-key az-calc-key--eq" type="button" data-calc="=">=</button>
    </div>
  </div></div>`;

  const display = container.querySelector('[data-calc-display]');
  const memoryIndicator = container.querySelector('[data-calc-memory-indicator]');

  let current = '0';
  let operand = null;
  let operator = null;
  let resetNext = false;
  let memory = 0;

  function render() {
    display.textContent = current;
    memoryIndicator.textContent = memory !== 0 ? 'M' : '';
  }

  function showError() {
    current = 'Error';
    operand = null;
    operator = null;
    resetNext = true;
    sound.play('error');
    render();
  }

  function applyOperator(a, b, op) {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '×': return a * b;
      case '÷': return b === 0 ? NaN : a / b;
      default: return b;
    }
  }

  function press(key) {
    if (current === 'Error' && key !== 'c' && key !== 'ce') return;
    if (/[0-9]/.test(key)) {
      current = resetNext || current === '0' ? key : current + key;
      resetNext = false;
    } else if (key === '.') {
      if (resetNext) {
        current = '0.';
        resetNext = false;
      } else if (!current.includes('.')) current += '.';
    } else if (key === 'c') {
      current = '0';
      operand = null;
      operator = null;
      resetNext = false;
    } else if (key === 'ce') {
      current = '0';
      resetNext = false;
    } else if (key === 'back') {
      current = current.length > 1 ? current.slice(0, -1) : '0';
    } else if (key === 'neg') {
      current = current.startsWith('-') ? current.slice(1) : (current === '0' ? current : `-${current}`);
    } else if (key === 'sqrt') {
      const value = parseFloat(current);
      if (value < 0) return showError();
      current = String(Number(Math.sqrt(value).toPrecision(12)));
      resetNext = true;
    } else if (['+','-','×','÷'].includes(key)) {
      if (operand !== null && operator && !resetNext) {
        const result = applyOperator(operand, parseFloat(current), operator);
        if (!Number.isFinite(result)) return showError();
        current = String(Number(result.toPrecision(12)));
      }
      operand = parseFloat(current);
      operator = key;
      resetNext = true;
    } else if (key === '=') {
      if (operand !== null && operator) {
        const result = applyOperator(operand, parseFloat(current), operator);
        if (!Number.isFinite(result)) return showError();
        current = String(Number(result.toPrecision(12)));
        operand = null;
        operator = null;
        resetNext = true;
      }
    } else if (key === 'm') {
      memory = 0;
    } else if (key === 'r') {
      current = String(memory);
      resetNext = true;
    } else if (key === 's') {
      memory = parseFloat(current) || 0;
    } else if (key === 'p') {
      memory += parseFloat(current) || 0;
    }
    render();
  }

  function handleClick(event) {
    const key = event.target.closest('[data-calc]')?.dataset.calc;
    if (!key) return;
    sound.play('click');
    press(key);
  }

  function handleKeydown(event) {
    if (!container.contains(document.activeElement) && document.activeElement !== document.body) return;
    const map = { '*': '×', '/': '÷', Enter: '=', '=': '=', Escape: 'c', Backspace: 'back' };
    const key = map[event.key] ?? event.key;
    if (/[0-9.]|^[+\-×÷]$|^=$|^back$|^c$/.test(key)) {
      event.preventDefault();
      sound.play('click');
      press(key);
    }
  }

  container.addEventListener('click', handleClick);
  document.addEventListener('keydown', handleKeydown);
  render();

  return {
    cleanup() {
      container.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeydown);
    },
  };
}
