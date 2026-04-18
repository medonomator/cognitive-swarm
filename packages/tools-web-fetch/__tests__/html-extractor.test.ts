import { describe, it, expect } from 'vitest'
import { extractContent } from '../src/html-extractor.js'

describe('extractContent', () => {
  it('extracts title from <title> tag', () => {
    const html = '<html><head><title>Hello World</title></head><body></body></html>'
    expect(extractContent(html).title).toBe('Hello World')
  })

  it('prefers og:title over <title>', () => {
    const html = `
      <head>
        <title>Fallback</title>
        <meta property="og:title" content="OG Title" />
      </head>
    `
    expect(extractContent(html).title).toBe('OG Title')
  })

  it('extracts description from meta', () => {
    const html = '<meta name="description" content="A great page">'
    expect(extractContent(html).description).toBe('A great page')
  })

  it('strips scripts, styles, and tags from text', () => {
    const html = `
      <html><body>
        <script>var x = 1;</script>
        <style>.foo { color: red; }</style>
        <p>Hello world</p>
        <nav>nav stuff</nav>
        <p>Second paragraph</p>
      </body></html>
    `
    const result = extractContent(html)
    expect(result.text).toContain('Hello world')
    expect(result.text).toContain('Second paragraph')
    expect(result.text).not.toContain('var x = 1')
    expect(result.text).not.toContain('.foo')
    expect(result.text).not.toContain('nav stuff')
  })

  it('extracts links', () => {
    const html = `
      <a href="https://example.com">Example</a>
      <a href="https://test.org">Test</a>
      <a href="#anchor">Skip</a>
    `
    const result = extractContent(html)
    expect(result.links).toHaveLength(2)
    expect(result.links[0]!.href).toBe('https://example.com')
    expect(result.links[0]!.text).toBe('Example')
  })

  it('deduplicates links', () => {
    const html = `
      <a href="https://example.com">First</a>
      <a href="https://example.com">Duplicate</a>
    `
    expect(extractContent(html).links).toHaveLength(1)
  })

  it('decodes HTML entities', () => {
    const html = '<p>A &amp; B &lt; C &mdash; D</p>'
    expect(extractContent(html).text).toContain('A & B < C — D')
  })

  it('counts words correctly', () => {
    const html = '<p>one two three four five</p>'
    expect(extractContent(html).wordCount).toBe(5)
  })

  it('handles empty HTML', () => {
    const result = extractContent('')
    expect(result.title).toBe('')
    expect(result.text).toBe('')
    expect(result.links).toHaveLength(0)
    expect(result.wordCount).toBe(0)
  })
})
