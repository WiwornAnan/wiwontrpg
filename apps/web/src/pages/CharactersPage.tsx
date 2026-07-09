import { Link } from 'react-router-dom';
import { CategoryDocLayout } from '../components/CategoryDocLayout';

export function CharactersPage() {
  return (
    <CategoryDocLayout
      category="characters"
      heroAction={
        <Link
          to="/dweller"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: '#e07a5f',
            color: '#fff',
            border: 'none',
            borderRadius: 11,
            padding: '11px 20px',
            fontSize: 14,
            fontWeight: 700,
            textDecoration: 'none',
            boxShadow: '0 8px 20px -6px rgba(224,122,95,.6)',
            whiteSpace: 'nowrap',
          }}
        >
          🗎 Dweller Sheet
        </Link>
      }
    />
  );
}
