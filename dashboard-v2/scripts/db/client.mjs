import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

function sql(strings, ...values) {
  const text = strings.reduce((acc, part, i) => {
    const next = i < values.length ? `$${i + 1}` : '';
    return `${acc}${part}${next}`;
  }, '');
  return pool.query(text, values).then((res) => res.rows);
}

export default sql;
