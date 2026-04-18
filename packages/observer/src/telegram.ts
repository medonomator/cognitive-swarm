import { request as httpsRequest } from 'node:https'
import { HttpsProxyAgent } from 'https-proxy-agent'

const MAX_MESSAGE_LENGTH = 4096

interface TelegramConfig {
  readonly botToken: string
  readonly chatId: string
}

function getProxyAgent(): HttpsProxyAgent<string> | undefined {
  const proxy =
    process.env['https_proxy'] ??
    process.env['HTTPS_PROXY'] ??
    process.env['http_proxy'] ??
    process.env['HTTP_PROXY']
  return proxy ? new HttpsProxyAgent(proxy) : undefined
}

/**
 * Escape special characters for Telegram MarkdownV2.
 */
function escapeMarkdownV2(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1')
}

/**
 * Format the swarm analysis into a Telegram-friendly report.
 */
export function formatTelegramReport(
  analysis: string,
  stats: {
    conversations: number
    totalMessages: number
    totalTokens: number
    memoriesStored: number
  },
): string {
  const date = new Date().toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const header = `*Claude Observer Report*\n${escapeMarkdownV2(date)}\n\n`

  const statsLine =
    `${escapeMarkdownV2(`${stats.conversations} conversations`)} ` +
    `${escapeMarkdownV2(`| ${stats.totalMessages} messages`)} ` +
    `${escapeMarkdownV2(`| ${stats.totalTokens.toLocaleString()} tokens`)}\n` +
    `${escapeMarkdownV2(`${stats.memoriesStored} insights stored in memory`)}\n\n`

  const body = escapeMarkdownV2(analysis)

  const full = header + statsLine + body

  if (full.length <= MAX_MESSAGE_LENGTH) return full
  return full.slice(0, MAX_MESSAGE_LENGTH - 20) + '\n\n\\.\\.\\. truncated'
}

/**
 * Send a message to Telegram via HTTPS with proxy support.
 */
function postToTelegram(
  botToken: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; description?: string }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload)
    const agent = getProxyAgent()

    const req = httpsRequest(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
        agent,
      },
      (res) => {
        let body = ''
        res.on('data', (chunk: Buffer) => {
          body += chunk.toString()
        })
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body) as { ok: boolean; description?: string }
            resolve(parsed)
          } catch {
            resolve({ ok: false, description: body })
          }
        })
      },
    )

    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

/**
 * Send a message to Telegram.
 */
export async function sendTelegramMessage(
  config: TelegramConfig,
  text: string,
): Promise<boolean> {
  try {
    const result = await postToTelegram(config.botToken, {
      chat_id: config.chatId,
      text,
      parse_mode: 'MarkdownV2',
    })

    if (!result.ok) {
      console.error(`Telegram API error: ${result.description}`)

      // Retry without markdown if parsing failed
      if (result.description?.includes("can't parse")) {
        const plain = text.replace(/\\([_*\[\]()~`>#+\-=|{}.!\\])/g, '$1')
        const retry = await postToTelegram(config.botToken, {
          chat_id: config.chatId,
          text: plain,
        })
        return retry.ok
      }
      return false
    }

    return true
  } catch (error) {
    console.error('Failed to send Telegram message:', error)
    return false
  }
}

/**
 * Send a long report as multiple messages if needed.
 */
export async function sendReport(
  config: TelegramConfig,
  report: string,
): Promise<boolean> {
  if (report.length <= MAX_MESSAGE_LENGTH) {
    return sendTelegramMessage(config, report)
  }

  const chunks: string[] = []
  let current = ''

  for (const line of report.split('\n')) {
    if (current.length + line.length + 1 > MAX_MESSAGE_LENGTH - 50) {
      chunks.push(current)
      current = ''
    }
    current += (current ? '\n' : '') + line
  }
  if (current) chunks.push(current)

  // Max 5 messages to prevent spam
  const limited = chunks.slice(0, 5)
  let success = true
  for (const chunk of limited) {
    const ok = await sendTelegramMessage(config, chunk)
    if (!ok) success = false
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  return success
}
