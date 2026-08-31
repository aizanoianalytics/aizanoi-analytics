/** Private Calculator implementation. Shared services arrive only as capabilities. */
export async function mountCalculator({ container, capabilities }) {
  const { sound } = capabilities;
  container.innerHTML = `
  <div class="az-app-shell az-utility-shell az-calculator-shell">
    <div class="az-calc" aria-label="Standard calculator">
      <div class="az-calc-meta"><span>Standard</span><strong data-calc-memory-indicator aria-label="Memory status"></strong></div>
      <div class="az-calc-display" data-calc-display role="status" aria-live="polite">0</div>
      <div class="az-calc-memory" role="group" aria-label="Memory controls">
        ${[['MC','m'],['MR','r'],['MS','s'],['M+','p']].map(([label, action]) => `<button class="az-calc-key az-calc-key--memory" type="button" data-calc="${action}">${label}</button>`).join('')}
      </div>
      <div class="az-calc-keys" role="group" aria-label="Calculator keypad">
        <button class="az-calc-key az-calc-key--fn" type="button" data-calc="sqrt">√</button>
        <button class="az-calc-key az-calc-key--fn" type="button" data-calc="back">Back</button>
        <button class="az-calc-key az-calc-key--fn" type="button" data-calc="ce">CE</button>
        <button class="az-calc-key az-calc-key--fn" type="button" data-calc="c">C</button>
        <button class="az-calc-key" type="button" data-calc="7">7</button>
        <button class="az-calc-key" type="button" data-calc="8">8</button>
        <button class="az-calc-key" type="button" data-calc="9">9</button>
        <button class="az-calc-key az-calc-key--operator" type="button" data-calc="÷">÷</button>
        <button class="az-calc-key" type="button" data-calc="4">4</button>
        <button class="az-calc-key" type="button" data-calc="5">5</button>
        <button class="az-calc-key" type="button" data-calc="6">6</button>
        <button class="az-calc-key az-calc-key--operator" type="button" data-calc="×">×</button>
        <button class="az-calc-key" type="button" data-calc="1">1</button>
        <button class="az-calc-key" type="button" data-calc="2">2</button>
        <button class="az-calc-key" type="button" data-calc="3">3</button>
        <button class="az-calc-key az-calc-key--operator" type="button" data-calc="-">−</button>
        <button class="az-calc-key" type="button" data-calc="neg">±</button>
        <button class="az-calc-key" type="button" data-calc="0">0</button>
        <button class="az-calc-key" type="button" data-calc=".">.</button>
        <button class="az-calc-key az-calc-key--operator" type="button" data-calc="+">+</button>
        <button class="az-calc-key az-calc-key--eq" type="button" data-calc="=">=</button>
      </div>
    </div>
  </div>`;

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
    if (/^[0-9]$/.test(key)) {
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
      if (resetNext) return;
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
    const active = document.activeElement;
    const hostWindow = container.closest('.az-window');
    if (!container.contains(active) && active !== document.body && active !== hostWindow) return;
    const map = { '*':'×', '/':'÷', Enter:'=', '=':'=', Escape:'c', Backspace:'back' };
    const key = map[event.key] ?? event.key;
    if (/^[0-9.]$|^[+\-×÷]$|^=$|^back$|^c$/.test(key)) {
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
