import './controls.css';

interface ColorSwatchProps {
  color: string;
  selected: boolean;
  onClick: () => void;
  size?: number;
}

export function ColorSwatch({ color, selected, onClick, size = 32 }: ColorSwatchProps) {
  return (
    <button
      type="button"
      className={`ctrl-swatch ${selected ? 'ctrl-swatch--selected' : ''}`}
      style={{
        width: size,
        height: size,
        background: color,
      }}
      onClick={onClick}
      title={color}
    />
  );
}
