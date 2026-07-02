import type { FilterField } from '@wiwonanant/shared';

interface Props {
  fields: FilterField[];
  filters: Record<string, string>;
  ranges: Record<string, { min?: string; max?: string }>;
  extraOptions?: Record<string, string[]>;
  hiddenOptions?: Record<string, string[]>;
  onFilter: (key: string, value: string) => void;
  onRange: (key: string, bound: 'min' | 'max', value: string) => void;
  onClear: () => void;
}

const selStyle: React.CSSProperties = { flex: 1, width: '100%', border: '1px solid #e0ded7', borderRadius: 8, padding: '9px 11px', fontSize: 13, background: '#faf9f7', outline: 'none', color: '#46443c' };

export function AdvancedFilterPanel({ fields, filters, ranges, extraOptions, hiddenOptions, onFilter, onRange, onClear }: Props) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e4e2dc', borderRadius: 14, padding: '22px 24px', marginBottom: 16, animation: 'fadeIn .25s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Filter by Tags</h3>
        <button onClick={onClear} style={{ background: 'none', border: 'none', fontSize: 12.5, color: '#8d8a82', cursor: 'pointer' }}>
          ล้างตัวกรอง
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px 32px' }}>
        {fields.map((f) => (
          <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12.5, color: '#5f5c54', minWidth: 118 }}>{f.label}:</span>
            {f.kind === 'range' ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                <input value={ranges[f.key]?.min ?? ''} onChange={(e) => onRange(f.key, 'min', e.target.value)} placeholder="Min" style={{ width: '48%', border: '1px solid #e0ded7', borderRadius: 8, padding: '9px 10px', fontSize: 13, background: '#faf9f7', outline: 'none' }} />
                <span style={{ color: '#a8a59d' }}>-</span>
                <div style={{ width: '48%', display: 'flex', alignItems: 'center', border: '1px solid #e0ded7', borderRadius: 8, background: '#faf9f7', paddingRight: 7 }}>
                  <input value={ranges[f.key]?.max ?? ''} onChange={(e) => onRange(f.key, 'max', e.target.value)} placeholder="Max" style={{ flex: 1, width: '100%', border: 'none', background: 'transparent', padding: '9px 10px', fontSize: 13, outline: 'none' }} />
                  <span style={{ fontSize: 11, color: '#8d8a82', background: '#edeae4', borderRadius: 4, padding: '2px 6px' }}>{f.unit}</span>
                </div>
              </div>
            ) : f.kind === 'checks' ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 16 }}>
                {(f.options ?? []).map((o) => {
                  const on = filters[f.key] === o;
                  return (
                    <div key={o} onClick={() => onFilter(f.key, on ? '' : o)} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                      <div style={{ width: 18, height: 18, borderRadius: 5, flex: 'none', border: `2px solid ${on ? '#5b3fa0' : '#cbc8c0'}`, background: on ? '#7c5fc0' : '#fff' }} />
                      <span style={{ fontSize: 13, color: '#46443c' }}>{o}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <select value={filters[f.key] ?? ''} onChange={(e) => onFilter(f.key, e.target.value)} style={selStyle}>
                <option value="">{f.any ?? 'ทั้งหมด'}</option>
                {[...(f.options ?? []).filter((o) => !(hiddenOptions?.[f.key] ?? []).includes(o)), ...(extraOptions?.[f.key] ?? [])].map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
