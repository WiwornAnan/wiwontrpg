export function Placeholder({ title, note }: { title: string; note?: string }) {
  return (
    <div style={{ maxWidth: 'var(--maxw)', margin: '0 auto', padding: '48px 40px' }}>
      <div
        style={{
          background: '#fff',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '56px 40px',
          textAlign: 'center',
        }}
      >
        <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 30 }}>{title}</h1>
        <p style={{ color: 'var(--text-faint)', fontSize: 14, marginTop: 12 }}>
          {note ?? 'ส่วนนี้กำลังอยู่ระหว่างการพัฒนา'}
        </p>
      </div>
    </div>
  );
}
