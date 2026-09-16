/**
 * Renders a row of N single-digit boxes into `container` and wires up
 * auto-advance / backspace / paste behavior. Calls `onChange(value)` on
 * every edit and `onComplete(value)` once all boxes are filled.
 */
function createOtpInput(container, { length = 6, onChange, onComplete } = {}) {
  container.innerHTML = '';
  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', 'Verification code');

  const boxes = [];

  for (let i = 0; i < length; i += 1) {
    const box = document.createElement('input');
    box.type = 'text';
    box.inputMode = 'numeric';
    box.autocomplete = i === 0 ? 'one-time-code' : 'off';
    box.maxLength = 1;
    box.className = 'otp-box';
    box.setAttribute('aria-label', `Digit ${i + 1} of ${length}`);
    container.appendChild(box);
    boxes.push(box);
  }

  function currentValue() {
    return boxes.map((b) => b.value).join('');
  }

  function focusBox(index) {
    const clamped = Math.max(0, Math.min(index, length - 1));
    boxes[clamped].focus();
    boxes[clamped].select();
  }

  boxes.forEach((box, index) => {
    box.addEventListener('input', (e) => {
      const digit = e.target.value.replace(/\D/g, '').slice(-1);
      box.value = digit;

      if (digit && index < length - 1) {
        focusBox(index + 1);
      }

      const value = currentValue();
      onChange && onChange(value);
      if (value.length === length) {
        onComplete && onComplete(value);
      }
    });

    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && index > 0) {
        focusBox(index - 1);
      }
      if (e.key === 'ArrowLeft' && index > 0) {
        e.preventDefault();
        focusBox(index - 1);
      }
      if (e.key === 'ArrowRight' && index < length - 1) {
        e.preventDefault();
        focusBox(index + 1);
      }
    });

    box.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData)
        .getData('text')
        .replace(/\D/g, '')
        .slice(0, length);
      if (!pasted) return;

      pasted.split('').forEach((digit, i) => {
        if (boxes[i]) boxes[i].value = digit;
      });
      focusBox(Math.min(pasted.length, length - 1));

      const value = currentValue();
      onChange && onChange(value);
      if (value.length === length) {
        onComplete && onComplete(value);
      }
    });
  });

  return {
    focusFirst: () => focusBox(0),
    clear: () => {
      boxes.forEach((b) => {
        b.value = '';
      });
      focusBox(0);
    },
    setError: (hasError) => {
      boxes.forEach((b) => b.classList.toggle('otp-box--error', hasError));
    },
    disable: (disabled) => {
      boxes.forEach((b) => {
        b.disabled = disabled;
      });
    },
    getValue: currentValue,
  };
}
