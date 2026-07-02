import type { FilterField } from '@wiwonanant/shared';
import { inputStyle, labelStyle } from './ui';
import styles from './catalog.module.css';

interface Props {
  fields: FilterField[];
  filters: Record<string, string>;
  ranges: Record<string, { min?: string; max?: string }>;
  extraOptions?: Record<string, string[]>; // dev-added custom tag options merged per field
  hiddenOptions?: Record<string, string[]>;
  onFilter: (key: string, value: string) => void;
  onRange: (key: string, bound: 'min' | 'max', value: string) => void;
}

export function AdvancedFilterPanel({ fields, filters, ranges, extraOptions, hiddenOptions, onFilter, onRange }: Props) {
  return (
    <div className={styles.filterPanel}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Filter by Tags</div>
      <div className={styles.filterGrid}>
        {fields.map((f) => {
          if (f.kind === 'range') {
            const r = ranges[f.key] ?? {};
            return (
              <div key={f.key}>
                <label style={labelStyle}>
                  {f.label} {f.unit ? `(${f.unit})` : ''}
                </label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="number" placeholder="Min" style={{ ...inputStyle, padding: '8px 10px' }} value={r.min ?? ''} onChange={(e) => onRange(f.key, 'min', e.target.value)} />
                  <span style={{ color: 'var(--text-ghost)' }}>–</span>
                  <input type="number" placeholder="Max" style={{ ...inputStyle, padding: '8px 10px' }} value={r.max ?? ''} onChange={(e) => onRange(f.key, 'max', e.target.value)} />
                </div>
              </div>
            );
          }
          if (f.kind === 'checks') {
            const cur = filters[f.key] ?? '';
            return (
              <div key={f.key}>
                <label style={labelStyle}>{f.label}</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(f.options ?? []).map((o) => (
                    <button
                      key={o}
                      onClick={() => onFilter(f.key, cur === o ? '' : o)}
                      className={`${styles.chip} ${cur === o ? styles.chipActive : ''}`}
                      style={{ padding: '5px 11px', fontSize: 12 }}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            );
          }
          const hidden = new Set(hiddenOptions?.[f.key] ?? []);
          const opts = [...(f.options ?? []).filter((o) => !hidden.has(o)), ...(extraOptions?.[f.key] ?? [])];
          return (
            <div key={f.key}>
              <label style={labelStyle}>{f.label}</label>
              <select style={{ ...inputStyle, padding: '8px 10px' }} value={filters[f.key] ?? ''} onChange={(e) => onFilter(f.key, e.target.value)}>
                <option value="">{f.any ?? 'ทั้งหมด'}</option>
                {opts.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}
