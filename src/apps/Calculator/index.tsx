import { useState, useCallback, useEffect } from 'react';
import type { AppComponentProps } from '@/shared/types';
import './Calculator.css';

type Op = '+' | '-' | '×' | '÷' | null;
type Mode = 'basic' | 'scientific';

export default function Calculator(_props: AppComponentProps) {
  const [display, setDisplay] = useState('0');
  const [expression, setExpression] = useState('');
  const [prevValue, setPrevValue] = useState<number | null>(null);
  const [op, setOp] = useState<Op>(null);
  const [resetNext, setResetNext] = useState(false);
  const [mode, setMode] = useState<Mode>('scientific');
  const [memory, setMemory] = useState(0);
  const [hasMemory, setHasMemory] = useState(false);
  const [isRadians, setIsRadians] = useState(true);
  const [isInverse, setIsInverse] = useState(false);

  const inputDigit = useCallback((d: string) => {
    if (resetNext) {
      setDisplay(d);
      setResetNext(false);
    } else {
      setDisplay((prev) => (prev === '0' ? d : prev + d));
    }
  }, [resetNext]);

  const inputDot = useCallback(() => {
    if (resetNext) {
      setDisplay('0.');
      setResetNext(false);
      return;
    }
    if (!display.includes('.')) setDisplay((prev) => prev + '.');
  }, [display, resetNext]);

  const compute = (a: number, operator: Op, b: number): number => {
    switch (operator) {
      case '+': return a + b;
      case '-': return a - b;
      case '×': return a * b;
      case '÷': return b === 0 ? NaN : a / b;
      default: return b;
    }
  };

  const handleOp = useCallback((nextOp: Op) => {
    const current = parseFloat(display);
    if (prevValue !== null && op && !resetNext) {
      const result = compute(prevValue, op, current);
      setDisplay(String(result));
      setPrevValue(result);
      setExpression(`${result} ${nextOp}`);
    } else {
      setPrevValue(current);
      setExpression(`${current} ${nextOp}`);
    }
    setOp(nextOp);
    setResetNext(true);
  }, [display, prevValue, op, resetNext]);

  const handleEquals = useCallback(() => {
    if (prevValue === null || !op) return;
    const current = parseFloat(display);
    const result = compute(prevValue, op, current);
    setExpression(`${prevValue} ${op} ${current} =`);
    setDisplay(String(result));
    setPrevValue(null);
    setOp(null);
    setResetNext(true);
  }, [display, prevValue, op]);

  const handleClear = useCallback(() => {
    setDisplay('0');
    setExpression('');
    setPrevValue(null);
    setOp(null);
    setResetNext(false);
  }, []);

  const handleToggleSign = useCallback(() => {
    setDisplay((prev) => {
      if (prev === '0') return prev;
      return prev.startsWith('-') ? prev.slice(1) : '-' + prev;
    });
  }, []);

  const handlePercent = useCallback(() => {
    setDisplay((prev) => String(parseFloat(prev) / 100));
  }, []);

  const handleBackspace = useCallback(() => {
    setDisplay((prev) => (prev.length <= 1 ? '0' : prev.slice(0, -1)));
  }, []);

  /* ── Scientific operations ─────────────────────── */

  const toAngle = (v: number) => isRadians ? v : (v * Math.PI) / 180;
  const fromAngle = (v: number) => isRadians ? v : (v * 180) / Math.PI;

  const applyUnary = useCallback((fn: (n: number) => number, label: string) => {
    const current = parseFloat(display);
    const result = fn(current);
    setExpression(`${label}(${current})`);
    setDisplay(String(result));
    setResetNext(true);
  }, [display]);

  const handleSin = useCallback(() => {
    if (isInverse) {
      applyUnary((n) => fromAngle(Math.asin(n)), 'sin⁻¹');
    } else {
      applyUnary((n) => Math.sin(toAngle(n)), 'sin');
    }
    setIsInverse(false);
  }, [applyUnary, isInverse, isRadians]);

  const handleCos = useCallback(() => {
    if (isInverse) {
      applyUnary((n) => fromAngle(Math.acos(n)), 'cos⁻¹');
    } else {
      applyUnary((n) => Math.cos(toAngle(n)), 'cos');
    }
    setIsInverse(false);
  }, [applyUnary, isInverse, isRadians]);

  const handleTan = useCallback(() => {
    if (isInverse) {
      applyUnary((n) => fromAngle(Math.atan(n)), 'tan⁻¹');
    } else {
      applyUnary((n) => Math.tan(toAngle(n)), 'tan');
    }
    setIsInverse(false);
  }, [applyUnary, isInverse, isRadians]);

  const handleLn = useCallback(() => {
    if (isInverse) {
      applyUnary((n) => Math.exp(n), 'eˣ');
    } else {
      applyUnary((n) => Math.log(n), 'ln');
    }
    setIsInverse(false);
  }, [applyUnary, isInverse]);

  const handleLog = useCallback(() => {
    if (isInverse) {
      applyUnary((n) => Math.pow(10, n), '10ˣ');
    } else {
      applyUnary((n) => Math.log10(n), 'log');
    }
    setIsInverse(false);
  }, [applyUnary, isInverse]);

  const handleSqrt = useCallback(() => {
    if (isInverse) {
      applyUnary((n) => n * n, 'x²');
    } else {
      applyUnary((n) => Math.sqrt(n), '√');
    }
    setIsInverse(false);
  }, [applyUnary, isInverse]);

  const handlePower = useCallback(() => {
    const current = parseFloat(display);
    setPrevValue(current);
    setOp('×'); // Use × as placeholder; we override compute in equals
    setExpression(`${current} ^`);
    setResetNext(true);
    // We use a custom approach: store "power" intent
    setPowerMode(true);
  }, [display]);

  const [powerMode, setPowerMode] = useState(false);

  // Override equals for power mode
  const handleEqualsWithPower = useCallback(() => {
    if (powerMode && prevValue !== null) {
      const current = parseFloat(display);
      const result = Math.pow(prevValue, current);
      setExpression(`${prevValue} ^ ${current} =`);
      setDisplay(String(result));
      setPrevValue(null);
      setOp(null);
      setResetNext(true);
      setPowerMode(false);
      return;
    }
    handleEquals();
  }, [display, prevValue, powerMode, handleEquals]);

  const handleFactorial = useCallback(() => {
    const n = parseFloat(display);
    if (n < 0 || !Number.isInteger(n) || n > 170) {
      setExpression(`${n}!`);
      setDisplay('Error');
      setResetNext(true);
      return;
    }
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    setExpression(`${n}!`);
    setDisplay(String(result));
    setResetNext(true);
  }, [display]);

  const handlePi = useCallback(() => {
    setDisplay(String(Math.PI));
    setResetNext(true);
  }, []);

  const handleE = useCallback(() => {
    setDisplay(String(Math.E));
    setResetNext(true);
  }, []);

  const handleAbs = useCallback(() => {
    applyUnary((n) => Math.abs(n), '|x|');
  }, [applyUnary]);

  const handleReciprocal = useCallback(() => {
    applyUnary((n) => 1 / n, '1/x');
  }, [applyUnary]);

  /* ── Memory operations ─────────────────────────── */

  const handleMC = useCallback(() => { setMemory(0); setHasMemory(false); }, []);
  const handleMR = useCallback(() => { setDisplay(String(memory)); setResetNext(true); }, [memory]);
  const handleMPlus = useCallback(() => {
    setMemory((m) => m + parseFloat(display));
    setHasMemory(true);
    setResetNext(true);
  }, [display]);
  const handleMMinus = useCallback(() => {
    setMemory((m) => m - parseFloat(display));
    setHasMemory(true);
    setResetNext(true);
  }, [display]);

  /* ── Keyboard support ──────────────────────────── */

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') inputDigit(e.key);
      else if (e.key === '.') inputDot();
      else if (e.key === '+') handleOp('+');
      else if (e.key === '-') handleOp('-');
      else if (e.key === '*') handleOp('×');
      else if (e.key === '/') { e.preventDefault(); handleOp('÷'); }
      else if (e.key === 'Enter' || e.key === '=') handleEqualsWithPower();
      else if (e.key === 'Escape') handleClear();
      else if (e.key === 'Backspace') handleBackspace();
      else if (e.key === '%') handlePercent();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [inputDigit, inputDot, handleOp, handleEqualsWithPower, handleClear, handleBackspace, handlePercent]);

  /* ── Format display ────────────────────────────── */

  const formatDisplay = (val: string) => {
    const num = parseFloat(val);
    if (val === 'Error') return 'Error';
    if (isNaN(num)) return 'Error';
    if (!isFinite(num)) return '∞';
    if (val.includes('.') && val.endsWith('.')) return val;
    if (val.includes('.') && val.endsWith('0') && !resetNext) return val;
    if (Math.abs(num) >= 1e12) return num.toExponential(4);
    return val;
  };

  /* ── Button layout ─────────────────────────────── */

  type BtnDef = { label: string; type: string; action: () => void; span?: number };

  const basicButtons: BtnDef[] = [
    { label: 'AC', type: 'func', action: handleClear },
    { label: '±', type: 'func', action: handleToggleSign },
    { label: '%', type: 'func', action: handlePercent },
    { label: '÷', type: 'op', action: () => handleOp('÷') },
    { label: '7', type: 'number', action: () => inputDigit('7') },
    { label: '8', type: 'number', action: () => inputDigit('8') },
    { label: '9', type: 'number', action: () => inputDigit('9') },
    { label: '×', type: 'op', action: () => handleOp('×') },
    { label: '4', type: 'number', action: () => inputDigit('4') },
    { label: '5', type: 'number', action: () => inputDigit('5') },
    { label: '6', type: 'number', action: () => inputDigit('6') },
    { label: '-', type: 'op', action: () => handleOp('-') },
    { label: '1', type: 'number', action: () => inputDigit('1') },
    { label: '2', type: 'number', action: () => inputDigit('2') },
    { label: '3', type: 'number', action: () => inputDigit('3') },
    { label: '+', type: 'op', action: () => handleOp('+') },
    { label: '0', type: 'number', action: () => inputDigit('0'), span: 2 },
    { label: '.', type: 'number', action: inputDot },
    { label: '=', type: 'equals', action: handleEqualsWithPower },
  ];

  const sciButtons: BtnDef[] = [
    // Row 1: Memory
    { label: 'MC', type: 'sci', action: handleMC },
    { label: 'MR', type: 'sci', action: handleMR },
    { label: 'M+', type: 'sci', action: handleMPlus },
    { label: 'M−', type: 'sci', action: handleMMinus },
    { label: '⌫', type: 'func', action: handleBackspace },
    // Row 2: Inverse, trig
    { label: isInverse ? '2nd ●' : '2nd', type: 'sci' + (isInverse ? ' toggled' : ''), action: () => setIsInverse((v) => !v) },
    { label: isInverse ? 'sin⁻¹' : 'sin', type: 'sci', action: handleSin },
    { label: isInverse ? 'cos⁻¹' : 'cos', type: 'sci', action: handleCos },
    { label: isInverse ? 'tan⁻¹' : 'tan', type: 'sci', action: handleTan },
    { label: isRadians ? 'RAD' : 'DEG', type: 'sci', action: () => setIsRadians((v) => !v) },
    // Row 3: Logarithmic
    { label: isInverse ? 'eˣ' : 'ln', type: 'sci', action: handleLn },
    { label: isInverse ? '10ˣ' : 'log', type: 'sci', action: handleLog },
    { label: isInverse ? 'x²' : '√x', type: 'sci', action: handleSqrt },
    { label: 'xʸ', type: 'sci', action: handlePower },
    { label: 'x!', type: 'sci', action: handleFactorial },
    // Row 4: Constants & misc
    { label: 'π', type: 'sci', action: handlePi },
    { label: 'e', type: 'sci', action: handleE },
    { label: '|x|', type: 'sci', action: handleAbs },
    { label: '1/x', type: 'sci', action: handleReciprocal },
    { label: '±', type: 'func', action: handleToggleSign },
    // Rows 5-8: Number pad (same as basic but in 5-col grid)
    { label: 'AC', type: 'func', action: handleClear },
    { label: '(', type: 'func', action: () => { } }, // Placeholder for grouping
    { label: ')', type: 'func', action: () => { } },
    { label: '%', type: 'func', action: handlePercent },
    { label: '÷', type: 'op', action: () => handleOp('÷') },
    { label: '7', type: 'number', action: () => inputDigit('7') },
    { label: '8', type: 'number', action: () => inputDigit('8') },
    { label: '9', type: 'number', action: () => inputDigit('9') },
    { label: '×', type: 'op', action: () => handleOp('×') },
    { label: '⌫', type: 'func', action: handleBackspace },
    { label: '4', type: 'number', action: () => inputDigit('4') },
    { label: '5', type: 'number', action: () => inputDigit('5') },
    { label: '6', type: 'number', action: () => inputDigit('6') },
    { label: '-', type: 'op', action: () => handleOp('-') },
    { label: ' ', type: 'number', action: () => { } },  // spacer
    { label: '1', type: 'number', action: () => inputDigit('1') },
    { label: '2', type: 'number', action: () => inputDigit('2') },
    { label: '3', type: 'number', action: () => inputDigit('3') },
    { label: '+', type: 'op', action: () => handleOp('+') },
    { label: '=', type: 'equals', action: handleEqualsWithPower },
    { label: '0', type: 'number', action: () => inputDigit('0'), span: 2 },
    { label: '.', type: 'number', action: inputDot },
  ];

  const buttons = mode === 'basic' ? basicButtons : sciButtons;

  return (
    <div className="calculator">
      {/* Mode toggle */}
      <div className="calculator__mode-toggle">
        <button
          className={`calculator__mode-btn ${mode === 'basic' ? 'calculator__mode-btn--active' : ''}`}
          onClick={() => setMode('basic')}
        >
          Basic
        </button>
        <button
          className={`calculator__mode-btn ${mode === 'scientific' ? 'calculator__mode-btn--active' : ''}`}
          onClick={() => setMode('scientific')}
        >
          Scientific
        </button>
      </div>

      {/* Display */}
      <div className="calculator__display">
        <div className="calculator__expression">{expression}</div>
        <div className="calculator__result">{formatDisplay(display)}</div>
        <div className="calculator__memory-indicator">
          {hasMemory ? `M = ${memory}` : ''}
          {mode === 'scientific' && ` ${isRadians ? 'RAD' : 'DEG'}`}
        </div>
      </div>

      {/* Grid */}
      <div className={`calculator__grid calculator__grid--${mode}`}>
        {buttons.map((btn, i) => (
          <button
            key={`${btn.label}-${i}`}
            className={[
              'calculator__btn',
              `calculator__btn--${btn.type.split(' ')[0]}`,
              btn.span === 2 ? 'calculator__btn--zero' : '',
              btn.type === 'op' && op === btn.label ? 'calculator__btn--active-op' : '',
              btn.type.includes('toggled') ? 'calculator__btn--toggled' : '',
            ].filter(Boolean).join(' ')}
            style={btn.span ? { gridColumn: `span ${btn.span}` } : undefined}
            onClick={btn.action}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}
