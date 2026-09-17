import { Fragment, type ReactNode } from 'react';

export interface PublicServiceLegalDocument {
  title: string;
  version: number;
  content: string;
}

function normalizeHeading(value: string) {
  return value.replace(/^#+\s*/, '').trim();
}

export function ServiceLegalDocumentContent({
  document,
}: {
  document: PublicServiceLegalDocument;
}) {
  const lines = document.content.replace(/\r\n/g, '\n').split('\n');
  let skippedDocumentTitle = false;
  const content: ReactNode[] = [];

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    if (!skippedDocumentTitle && normalizeHeading(line) === document.title) {
      skippedDocumentTitle = true;
      return;
    }
    if (line === '---') {
      content.push(<hr key={index} />);
      return;
    }
    if (line.startsWith('### ')) {
      content.push(<h3 key={index}>{line.slice(4)}</h3>);
      return;
    }
    if (line.startsWith('## ')) {
      content.push(<h2 key={index}>{line.slice(3)}</h2>);
      return;
    }
    if (line.startsWith('# ')) {
      content.push(<h2 key={index}>{line.slice(2)}</h2>);
      return;
    }
    if (/^-\s+/.test(line)) {
      content.push(
        <p className="service-legal-document__list-item" key={index}>
          <span aria-hidden="true">•</span> {line.replace(/^-\s+/, '')}
        </p>,
      );
      return;
    }
    content.push(<p key={index}>{line}</p>);
  });

  return <Fragment>{content}</Fragment>;
}
