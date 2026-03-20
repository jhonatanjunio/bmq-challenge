/* Componente de syntax highlighting para JSON */

import { useMemo } from 'react';

interface JsonHighlightProps {
  data: unknown;
}

export function JsonHighlight({ data }: JsonHighlightProps) {
  const highlighted = useMemo(() => {
    const json = JSON.stringify(data, null, 2);
    return json.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      (match) => {
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            return `<span class="json-key">${match}</span>`;
          }
          return `<span class="json-str">${match}</span>`;
        }
        if (/true|false/.test(match))
          return `<span class="json-bool">${match}</span>`;
        if (/null/.test(match))
          return `<span class="json-null">${match}</span>`;
        return `<span class="json-num">${match}</span>`;
      }
    );
  }, [data]);

  return (
    <pre
      style={{
        fontSize: '0.72rem',
        lineHeight: '1.5',
        background: '#0d0f18',
        border: '1px solid #1e2436',
        borderRadius: 6,
        padding: '10px 12px',
        overflowX: 'auto',
        color: '#94a3b8',
        margin: 0,
      }}
      dangerouslySetInnerHTML={{ __html: highlighted }}
    />
  );
}
