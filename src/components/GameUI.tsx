'use client';

interface Props {
  voxelCount: number;
  activeColor: number;
  colors: readonly number[];
  onColorSelect: (i: number) => void;
  onGenerate: () => void;
}

export function GameUI({ voxelCount, activeColor, colors, onColorSelect, onGenerate }: Props) {
  return (
    <>
      <div style={{
        position: 'fixed', top: 12, left: 12,
        background: 'rgba(0,0,0,0.55)', color: '#fff',
        padding: '8px 12px', borderRadius: 8, fontSize: 13, lineHeight: 1.7,
        pointerEvents: 'none', userSelect: 'none',
      }}>
        <div>Click — place voxel</div>
        <div>⌘ click — remove voxel</div>
        <div>Drag — rotate</div>
        <div>Two-finger drag — pan</div>
        <div>Pinch — zoom</div>
      </div>

      <div style={{
        position: 'fixed', top: 12, right: 12,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8,
      }}>
        <div style={{
          background: 'rgba(0,0,0,0.55)', color: '#fff',
          padding: '6px 12px', borderRadius: 8, fontSize: 13,
          pointerEvents: 'none', userSelect: 'none',
        }}>
          Voxels: {voxelCount}
        </div>
        <button
          onClick={onGenerate}
          style={{
            background: 'rgba(0,0,0,0.55)', color: '#fff',
            border: '1px solid rgba(255,255,255,0.3)',
            padding: '6px 14px', borderRadius: 8, fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Generate landscape
        </button>
      </div>

      <div style={{
        position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 8,
        background: 'rgba(0,0,0,0.55)', padding: '8px 12px', borderRadius: 12,
      }}>
        {colors.map((color, i) => (
          <div
            key={i}
            onClick={() => onColorSelect(i)}
            style={{
              width: 32, height: 32, borderRadius: 6, cursor: 'pointer',
              background: `#${color.toString(16).padStart(6, '0')}`,
              border: activeColor === i ? '3px solid #fff' : '3px solid transparent',
              boxSizing: 'border-box',
            }}
          />
        ))}
      </div>
    </>
  );
}
