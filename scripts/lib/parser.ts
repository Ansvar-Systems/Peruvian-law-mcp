/**
 * HTML parser for Peruvian legislation published in Diario Oficial El Peruano.
 *
 * Source endpoint pattern:
 *   https://busquedas.elperuano.pe/api/visor_html/{OP}
 */

export interface ActIndexEntry {
  id: string;
  title: string;
  titleEn?: string;
  shortName: string;
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  issuedDate: string;
  inForceDate: string;
  /** El Peruano operation identifier, e.g. "2480387-2" */
  op: string;
  /** Public document page URL */
  url: string;
  description?: string;
}

export interface ParsedProvision {
  provision_ref: string;
  chapter?: string;
  section: string;
  title: string;
  content: string;
}

export interface ParsedDefinition {
  term: string;
  definition: string;
  source_provision?: string;
}

export interface ParsedAct {
  id: string;
  type: 'statute';
  title: string;
  title_en?: string;
  short_name: string;
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  issued_date: string;
  in_force_date: string;
  url: string;
  description?: string;
  provisions: ParsedProvision[];
  definitions: ParsedDefinition[];
}

function dedupeProvisionsByRef(provisions: ParsedProvision[]): ParsedProvision[] {
  const byRef = new Map<string, ParsedProvision>();

  for (const provision of provisions) {
    const existing = byRef.get(provision.provision_ref);
    if (!existing || provision.content.length > existing.content.length) {
      byRef.set(provision.provision_ref, provision);
    }
  }

  return Array.from(byRef.values());
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, d: string) => {
      const code = Number.parseInt(d, 10);
      return Number.isFinite(code) ? String.fromCharCode(code) : _;
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => {
      const code = Number.parseInt(h, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : _;
    })
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&Aacute;/g, 'Á')
    .replace(/&Eacute;/g, 'É')
    .replace(/&Iacute;/g, 'Í')
    .replace(/&Oacute;/g, 'Ó')
    .replace(/&Uacute;/g, 'Ú')
    .replace(/&aacute;/g, 'á')
    .replace(/&eacute;/g, 'é')
    .replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó')
    .replace(/&uacute;/g, 'ú')
    .replace(/&Ntilde;/g, 'Ñ')
    .replace(/&ntilde;/g, 'ñ')
    .replace(/&ordm;/g, 'º')
    .replace(/&deg;/g, '°');
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?\s*>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t\f\v]+/g, ' ')
      .trim(),
  );
}

function extractParagraphs(html: string): string[] {
  const paragraphs: string[] = [];
  const pRegex = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;

  let m: RegExpExecArray | null;
  while ((m = pRegex.exec(html)) !== null) {
    const text = stripHtml(m[1]);
    if (!text) continue;
    if (/^\d{7}-\d+$/.test(text)) continue; // publication operation marker
    paragraphs.push(text);
  }

  return paragraphs;
}

function normalizeSection(sectionRaw: string): { section: string; ref: string } {
  const upper = sectionRaw.toUpperCase();
  const normalizedSection = upper
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^UNICO$/, 'UNICO')
    .trim();

  const ref = normalizedSection.replace(/[^0-9A-Z]+/g, '').toLowerCase() || 'unico';
  return { section: normalizedSection, ref };
}

function extractDefinitions(content: string, sourceProvision: string): ParsedDefinition[] {
  const definitions: ParsedDefinition[] = [];

  // Pattern: "Término: definición" (common in directives/regulations)
  for (const match of content.matchAll(/(?:^|;|\.)\s*([A-ZÁÉÍÓÚÑa-záéíóúñ0-9\- ]{3,80}):\s*([^.;]{10,400})/g)) {
    const term = match[1].trim();
    const definition = match[2].trim();

    if (!term || !definition) continue;
    definitions.push({ term, definition, source_provision: sourceProvision });
  }

  return definitions;
}

/**
 * Parse El Peruano HTML into statute seed JSON.
 */
export function parsePeruvianHtml(html: string, act: ActIndexEntry): ParsedAct {
  const provisions: ParsedProvision[] = [];

  const bodyOnly = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const paragraphs = extractParagraphs(bodyOnly);
  const joined = paragraphs.join('\n');

  // Example matches:
  //   Artículo 1.- Objeto
  //   Artículo 1. Objeto
  //   Artículo I. Objeto
  //   “Artículo 12-A.- Adquisición, posesión y tráfico ...
  const articleRegex = /(?:^|\n)[“"']?(?:art[íi]culo)\s+([ÚU]NICO|[IVXLCDM]+|\d+[A-Za-zº°]?(?:-[A-Za-z0-9]+)?)\s*(?:\.\s*-\s*|\.\s+|-\s*|\.\-|:\s*)\s*([^\n]*)/gi;
  const matches = [...joined.matchAll(articleRegex)];

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const next = matches[i + 1];

    const sectionRaw = current[1].trim();
    const { section, ref } = normalizeSection(sectionRaw);
    const titleSuffix = current[2].trim().replace(/^[”"']+/, '').trim();
    const title = titleSuffix ? `Artículo ${section}.- ${titleSuffix}` : `Artículo ${section}`;

    const bodyStart = (current.index ?? 0) + current[0].length;
    const bodyEnd = next?.index ?? joined.length;
    let content = joined.substring(bodyStart, bodyEnd).replace(/\n+/g, ' ').trim();

    if (!content) {
      // One-line article; keep title suffix as content when body is empty.
      content = titleSuffix;
    }

    if (!content || content.length < 2) continue;

    // Remove accidental operation marker and normalize whitespace.
    content = content
      .replace(/\b\d{7}-\d+\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const provisionRef = `art${ref}`;

    provisions.push({
      provision_ref: provisionRef,
      section,
      title,
      content,
    });
  }

  const dedupedProvisions = dedupeProvisionsByRef(provisions);
  const definitions: ParsedDefinition[] = [];
  for (const provision of dedupedProvisions) {
    for (const def of extractDefinitions(provision.content, provision.provision_ref)) {
      definitions.push(def);
    }
  }

  return {
    id: act.id,
    type: 'statute',
    title: act.title,
    title_en: act.titleEn,
    short_name: act.shortName,
    status: act.status,
    issued_date: act.issuedDate,
    in_force_date: act.inForceDate,
    url: act.url,
    description: act.description,
    provisions: dedupedProvisions,
    definitions,
  };
}

/**
 * Curated corpus of cybersecurity/data-governance legislation with official
 * HTML available from El Peruano.
 */
export const KEY_PERUVIAN_ACTS: ActIndexEntry[] = [
  {
    id: 'pe-dl-1700',
    title: 'Decreto Legislativo N° 1700 que modifica la Ley N° 30096, Ley de Delitos Informáticos',
    titleEn: 'Legislative Decree No. 1700 amending Law No. 30096 (Cybercrime Law)',
    shortName: 'DL 1700',
    status: 'in_force',
    issuedDate: '2026-01-24',
    inForceDate: '2026-01-25',
    op: '2480387-2',
    url: 'https://busquedas.elperuano.pe/dispositivo/NL/2480387-2',
    description: 'Incorpora el delito de adquisición, posesión y tráfico ilícito de datos informáticos.',
  },
  {
    id: 'pe-dl-1741',
    title: 'Decreto Legislativo N° 1741 que modifica el artículo 12-A de la Ley N° 30096',
    titleEn: 'Legislative Decree No. 1741 amending Article 12-A of Law No. 30096',
    shortName: 'DL 1741',
    status: 'in_force',
    issuedDate: '2026-02-13',
    inForceDate: '2026-02-14',
    op: '2487222-3',
    url: 'https://busquedas.elperuano.pe/dispositivo/NL/2487222-3',
    description: 'Refuerza la tipificación del tráfico ilícito de datos en sectores financiero, bursátil, previsional y seguros.',
  },
  {
    id: 'pe-ds-reglamento-confianza-digital',
    title: 'Decreto Supremo que aprueba el Reglamento del Decreto de Urgencia N° 007-2020 (Marco de Confianza Digital)',
    titleEn: 'Supreme Decree approving regulations for Emergency Decree No. 007-2020 (Digital Trust Framework)',
    shortName: 'Reglamento Confianza Digital',
    status: 'in_force',
    issuedDate: '2025-11-04',
    inForceDate: '2025-11-05',
    op: '2455024-1',
    url: 'https://busquedas.elperuano.pe/dispositivo/NL/2455024-1',
    description: 'Reglamento del marco de confianza digital y medidas de fortalecimiento.',
  },
  {
    id: 'pe-rm-metodologia-multas-datos-personales',
    title: 'Resolución Ministerial que aprueba la Metodología para el cálculo de multas en protección de datos personales',
    titleEn: 'Ministerial Resolution approving methodology for personal data protection fines',
    shortName: 'RM Metodología Multas PDP',
    status: 'in_force',
    issuedDate: '2025-12-31',
    inForceDate: '2026-01-01',
    op: '2472880-1',
    url: 'https://busquedas.elperuano.pe/dispositivo/NL/2472880-1',
    description: 'Actualiza criterios sancionadores en materia de protección de datos personales.',
  },
  {
    id: 'pe-rd-oficial-datos-personales',
    title: 'Resolución Directoral que aprueba Directiva sobre el Oficial de Datos Personales',
    titleEn: 'Directorate Resolution approving directive on the Data Protection Officer',
    shortName: 'RD Oficial de Datos',
    status: 'in_force',
    issuedDate: '2025-12-31',
    inForceDate: '2026-01-01',
    op: '2472949-1',
    url: 'https://busquedas.elperuano.pe/dispositivo/NL/2472949-1',
    description: 'Regula designación, desempeño y funciones del Oficial de Datos Personales.',
  },
  {
    id: 'pe-ds-modifica-reglamento-rnhce',
    title: 'Decreto Supremo que modifica el Reglamento de la Ley N° 30024 (Registro Nacional de Historias Clínicas Electrónicas)',
    titleEn: 'Supreme Decree amending regulations of Law No. 30024 (National Electronic Medical Records Registry)',
    shortName: 'DS Modif. RNHCE',
    status: 'in_force',
    issuedDate: '2025-11-28',
    inForceDate: '2025-11-29',
    op: '2463489-2',
    url: 'https://busquedas.elperuano.pe/dispositivo/NL/2463489-2',
    description: 'Adecuación del reglamento sobre interoperabilidad e investigación en historias clínicas electrónicas.',
  },
  {
    id: 'pe-ds-modifica-reglamento-gobierno-digital',
    title: 'Decreto Supremo que modifica el Reglamento del Decreto Legislativo N° 1412 (Ley de Gobierno Digital)',
    titleEn: 'Supreme Decree amending regulations of Legislative Decree No. 1412 (Digital Government Law)',
    shortName: 'DS Modif. Gob. Digital',
    status: 'in_force',
    issuedDate: '2025-07-31',
    inForceDate: '2025-08-01',
    op: '2423580-2',
    url: 'https://busquedas.elperuano.pe/dispositivo/NL/2423580-2',
    description: 'Modifica disposiciones de identidad digital, interoperabilidad, seguridad digital y procedimiento administrativo electrónico.',
  },
  {
    id: 'pe-res-directiva-consumo-seguro-pide',
    title: 'Resolución que aprueba Directiva para consumo seguro de servicios de información de la PIDE',
    titleEn: 'Resolution approving directive for secure consumption of PIDE information services',
    shortName: 'Directiva PIDE Segura',
    status: 'in_force',
    issuedDate: '2025-10-17',
    inForceDate: '2025-10-18',
    op: '2449093-1',
    url: 'https://busquedas.elperuano.pe/dispositivo/NL/2449093-1',
    description: 'Establece medidas de seguridad digital en el consumo de servicios de la Plataforma de Interoperabilidad del Estado.',
  },
  {
    id: 'pe-rm-documento-seguridad-sihce-minsa',
    title: 'Resolución Ministerial que aprueba la Directiva del Documento de Seguridad del SIHCE del MINSA',
    titleEn: 'Ministerial Resolution approving security document directive for MINSA electronic health records system',
    shortName: 'RM Seguridad SIHCE',
    status: 'in_force',
    issuedDate: '2025-10-10',
    inForceDate: '2025-10-11',
    op: '2446793-1',
    url: 'https://busquedas.elperuano.pe/dispositivo/NL/2446793-1',
    description: 'Establece el documento de seguridad del Sistema de Historia Clínica Electrónica del MINSA.',
  },
  {
    id: 'pe-ds-reglamento-ia-31814',
    title: 'Decreto Supremo que aprueba el Reglamento de la Ley N° 31814 sobre inteligencia artificial',
    titleEn: 'Supreme Decree approving regulations of Law No. 31814 on artificial intelligence',
    shortName: 'Reglamento IA 31814',
    status: 'in_force',
    issuedDate: '2025-09-09',
    inForceDate: '2025-09-10',
    op: '2436426-1',
    url: 'https://busquedas.elperuano.pe/dispositivo/NL/2436426-1',
    description: 'Reglamento de la ley que promueve el uso de inteligencia artificial en favor del desarrollo económico y social.',
  },
];
