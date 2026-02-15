import './controls.css';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}

export function Slider({ label, value, min, max, step = 1, unit = '', onChange }: SliderProps) {
  return (
    <div className="ctrl-slider">
      <div className="ctrl-slider__header">
        <span className="ctrl-slider__label">{label}</span>
        <span className="ctrl-slider__value">
          {Number.isInteger(step) ? value : value.toFixed(2)}{unit}
        </span>
      </div>
      <input
        type="range"
        className="ctrl-slider__input"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
