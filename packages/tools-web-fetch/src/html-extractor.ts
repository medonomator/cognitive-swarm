/**
 * Lightweight HTML → structured text extractor.
 *
 * No external dependencies — regex-based extraction.
 * Not a full parser, but good enough for article content.
 */

// ── Public types ────────────────────────────────────────────────

export interface ExtractedContent {
  readonly title: string
  readonly description: string
  readonly text: string
  readonly links: readonly ExtractedLink[]
  readonly wordCount: number
}

export interface ExtractedLink {
  readonly text: string
  readonly href: string
}

// ── Extractor ───────────────────────────────────────────────────

/**
 * Extract readable content from raw HTML.
 */
export function extractContent(html: string): ExtractedContent {
  const title = extractTitle(html)
  const description = extractMeta(html, 'description')
    || extractMeta(html, 'og:description')
  const text = extractText(html)
  const links = extractLinks(html)
  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length

  return { title, description, text, links, wordCount }
}

// ── Internal helpers ────────────────────────────────────────────

function extractTitle(html: string): string {
  // Try og:title first, then <title>
  const ogTitle = extractMeta(html, 'og:title')
  if (ogTitle) return ogTitle

  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  return match ? decodeEntities(match[1]!.trim()) : ''
}

function extractMeta(html: string, name: string): string {
  // Match both name="..." and property="..."
  const patterns = [
    new RegExp(`<meta[^>]*(?:name|property)=["']${escapeRegex(name)}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*(?:name|property)=["']${escapeRegex(name)}["']`, 'i'),
  ]

  for (const pattern of patterns) {
    const match = pattern.exec(html)
    if (match?.[1]) return decodeEntities(match[1].trim())
  }

  return ''
}

function extractText(html: string): string {
  let text = html

  // Remove script, style, nav, footer, header blocks
  text = text.replace(/<(script|style|nav|footer|header|aside|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ')

  // Remove all HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, ' ')

  // Replace block-level tags with newlines
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|br|blockquote|article|section)>/gi, '\n')
  text = text.replace(/<br\s*\/?>/gi, '\n')

  // Remove remaining tags
  text = text.replace(/<[^>]+>/g, ' ')

  // Decode HTML entities
  text = decodeEntities(text)

  // Normalize whitespace
  text = text
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(line => line.length > 0)
    .join('\n')

  // Collapse multiple blank lines
  text = text.replace(/\n{3,}/g, '\n\n')

  return text.trim()
}

function extractLinks(html: string): ExtractedLink[] {
  const linkRegex = /<a[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi
  const links: ExtractedLink[] = []
  const seen = new Set<string>()

  let match: RegExpExecArray | null
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1]!.trim()
    const text = match[2]!.replace(/<[^>]+>/g, '').trim()

    if (text.length > 0 && href.length > 0 && !seen.has(href)) {
      seen.add(href)
      links.push({ text: decodeEntities(text), href })
    }
  }

  return links.slice(0, 50) // Cap at 50 links
}

// ── Utilities ───────────────────────────────────────────────────

const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&mdash;': '—',
  '&ndash;': '–',
  '&laquo;': '«',
  '&raquo;': '»',
  '&hellip;': '…',
}

function decodeEntities(text: string): string {
  // Named entities
  let result = text.replace(/&\w+;/g, entity => ENTITY_MAP[entity] ?? entity)
  // Numeric entities
  result = result.replace(/&#(\d+);/g, (_, code) =>
    String.fromCharCode(Number(code)),
  )
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
    String.fromCharCode(parseInt(hex as string, 16)),
  )
  return result
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
