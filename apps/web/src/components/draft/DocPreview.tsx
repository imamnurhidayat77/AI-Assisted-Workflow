'use client';

import { parseDraftBody } from '@street-smart/shared';

/** Kartu dokumen terstruktur ala Joule: seksi bernomor, tabel, footer —
 * di-parse dari body draft (## heading, - bullet, | tabel |, --- footer).
 * Dipakai di conversation (preview) dan inbox (review checker). */
export function DocPreview({ body }: { body: string }) {
  const sections = parseDraftBody(body);
  let n = 0;
  return <div className="doc-preview">
    {sections.map((s, i) => {
      if (s.footer) return <div key={i} className="doc-footer">{s.paragraphs.map((p, j) => <p key={j}>{p}</p>)}</div>;
      const num = s.heading ? ++n : n;
      return <div key={i} className="doc-section">
        {s.heading && <div className="doc-heading"><span className="doc-num">{num}</span><span>{s.heading}</span></div>}
        {s.paragraphs.map((p, j) => <p key={j} className="answer-copy">{p}</p>)}
        {s.bullets.length > 0 && <ul className="doc-bullets">{s.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>}
        {s.table && <div className="table-scroll"><table><thead><tr>{s.table.head.map((h, j) => <th key={j}>{h}</th>)}</tr></thead>
          <tbody>{s.table.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>{c}</td>)}</tr>)}</tbody></table></div>}
      </div>;
    })}
  </div>;
}
