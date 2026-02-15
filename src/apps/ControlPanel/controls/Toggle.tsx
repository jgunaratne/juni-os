import './controls.css';

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <label className="ctrl-toggle">
      <span className="ctrl-toggle__label">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`ctrl-toggle__track ${checked ? 'ctrl-toggle__track--on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="ctrl-toggle__thumb" />
      </button>
    </label>
  );
}
