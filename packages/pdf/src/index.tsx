import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { CvDocument, CvTemplate, LetterDocument } from '@jobsmith/shared';

/**
 * ATS-friendly A4 PDFs: one column, real selectable text in reading order, standard section headings,
 * no tables, no images of text. The built-in PDF fonts (Helvetica, Times) keep files small and need no
 * font files on the server or in the browser.
 */
// Never hyphenate: broken words and links on a CV read as mistakes, and ATS parsers stumble on them.
Font.registerHyphenationCallback((word) => [word]);

interface Theme {
  font: string;
  bold: string;
  italic: string;
  size: number;
  nameSize: number;
  gap: number;
  accent: string;
  centred: boolean;
  rule: boolean;
}

const THEMES: Record<CvTemplate, Theme> = {
  CLASSIC: { font: 'Times-Roman', bold: 'Times-Bold', italic: 'Times-Italic', size: 10.5, nameSize: 20, gap: 10, accent: '#161a2b', centred: true, rule: true },
  MODERN: { font: 'Helvetica', bold: 'Helvetica-Bold', italic: 'Helvetica-Oblique', size: 9.8, nameSize: 22, gap: 11, accent: '#3346d3', centred: false, rule: true },
  COMPACT: { font: 'Helvetica', bold: 'Helvetica-Bold', italic: 'Helvetica-Oblique', size: 8.8, nameSize: 16, gap: 7, accent: '#161a2b', centred: false, rule: false },
};

const INK = '#161a2b';
const SOFT = '#4b5168';

function styles(th: Theme) {
  return StyleSheet.create({
    page: { paddingTop: 40, paddingBottom: 40, paddingHorizontal: 46, fontFamily: th.font, fontSize: th.size, color: INK, lineHeight: 1.35 },
    header: { marginBottom: th.gap, textAlign: th.centred ? 'center' : 'left' },
    name: { fontFamily: th.bold, fontSize: th.nameSize, lineHeight: 1.15, color: th.centred ? INK : th.accent, marginBottom: 4 },
    headline: { fontSize: th.size + 1.5, lineHeight: 1.25, color: SOFT, marginBottom: 3 },
    contact: { fontSize: th.size - 0.5, color: SOFT },
    contactRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: th.centred ? 'center' : 'flex-start' },
    summary: { marginBottom: th.gap },
    section: { marginBottom: th.gap },
    sectionTitle: {
      fontFamily: th.bold,
      fontSize: th.size + 1.5,
      color: th.accent,
      paddingBottom: 2,
      marginBottom: 5,
      ...(th.rule ? { borderBottomWidth: th.centred ? 0.75 : 1, borderBottomColor: th.centred ? INK : th.accent } : {}),
    },
    entry: { marginBottom: th.gap * 0.6 },
    entryTop: { flexDirection: 'row', justifyContent: 'space-between' },
    heading: { fontFamily: th.bold, flexShrink: 1, paddingRight: 8 },
    meta: { color: SOFT, fontSize: th.size - 0.5, textAlign: 'right' },
    sub: { fontFamily: th.italic, color: SOFT },
    bulletRow: { flexDirection: 'row', marginTop: 1.5 },
    bulletMark: { width: 10 },
    bulletText: { flex: 1 },
    skills: { flexDirection: 'row', marginBottom: 2 },
    skillGroup: { fontFamily: th.bold },
  });
}

export function CvPdf({ doc, template }: { doc: CvDocument; template: CvTemplate }) {
  const th = THEMES[template];
  const s = styles(th);
  return (
    <Document title={`${doc.name} CV`} author={doc.name} creator="Jobsmith" producer="Jobsmith" language="en-GB">
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.name}>{doc.name}</Text>
          {doc.headline ? <Text style={s.headline}>{doc.headline}</Text> : null}
          {doc.contact.length ? (
            <View style={s.contactRow}>
              {doc.contact.map((c, i) => (
                <Text key={i} style={s.contact}>
                  {i ? '\u00a0\u00a0|\u00a0\u00a0 ' : ''}
                  {c}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
        {doc.summary ? (
          <View style={s.summary}>
            <Text>{doc.summary}</Text>
          </View>
        ) : null}
        {doc.sections.map((section) => (
          <View key={section.kind} style={s.section}>
            <Text style={s.sectionTitle} minPresenceAhead={40}>
              {section.title}
            </Text>
            {section.entries.map((e, i) =>
              section.kind === 'SKILLS' ? (
                <View key={i} style={s.skills} wrap={false}>
                  <Text>
                    <Text style={s.skillGroup}>{e.heading}: </Text>
                    {e.inline}
                  </Text>
                </View>
              ) : (
                <View key={i} style={s.entry}>
                  <View style={s.entryTop} wrap={false}>
                    <Text style={s.heading}>{e.heading}</Text>
                    {e.meta ? <Text style={s.meta}>{e.meta}</Text> : null}
                  </View>
                  {e.subheading ? <Text style={s.sub}>{e.subheading}</Text> : null}
                  {e.bullets.map((b, j) => (
                    <View key={j} style={s.bulletRow} wrap={false}>
                      <Text style={s.bulletMark}>•</Text>
                      <Text style={s.bulletText}>{b}</Text>
                    </View>
                  ))}
                </View>
              ),
            )}
          </View>
        ))}
      </Page>
    </Document>
  );
}

export function LetterPdf({ letter, template = 'MODERN' }: { letter: LetterDocument; template?: CvTemplate }) {
  const th = THEMES[template];
  const s = styles(th);
  return (
    <Document title={`${letter.name} cover letter`} author={letter.name} creator="Jobsmith" producer="Jobsmith" language="en-GB">
      <Page size="A4" style={{ ...s.page, fontSize: th.size + 1, lineHeight: 1.5, paddingHorizontal: 60, paddingTop: 56 }}>
        <View style={{ marginBottom: 24 }}>
          <Text style={{ ...s.name, fontSize: th.nameSize - 4 }}>{letter.name}</Text>
          {letter.contact.length ? <Text style={s.contact}>{letter.contact.join('  |  ')}</Text> : null}
        </View>
        <Text style={{ marginBottom: 18, color: SOFT }}>{letter.date}</Text>
        {letter.body
          .split(/\n{2,}/)
          .map((p) => p.trim())
          .filter(Boolean)
          .map((p, i) => (
            <Text key={i} style={{ marginBottom: 10 }}>
              {p}
            </Text>
          ))}
      </Page>
    </Document>
  );
}

/** Node only (the worker): render straight to a PDF buffer. */
export async function renderCvBuffer(doc: CvDocument, template: CvTemplate): Promise<Buffer> {
  const { renderToBuffer } = await import('@react-pdf/renderer');
  return renderToBuffer(<CvPdf doc={doc} template={template} />);
}

export async function renderLetterBuffer(letter: LetterDocument, template?: CvTemplate): Promise<Buffer> {
  const { renderToBuffer } = await import('@react-pdf/renderer');
  return renderToBuffer(<LetterPdf letter={letter} template={template} />);
}
