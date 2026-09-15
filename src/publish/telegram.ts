import { log } from '../log.js';

/**
 * 발행 알림 — 텔레그램 봇.
 * TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 가 .env 에 없으면 조용히 건너뛴다 (선택 기능).
 * 알림 실패는 발행 결과에 영향을 주지 않는다.
 */
export async function notifyTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: false }),
    });
    if (!res.ok) {
      log.warn(`텔레그램 알림 실패: HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
    }
  } catch (error) {
    log.warn(`텔레그램 알림 실패: ${error instanceof Error ? error.message : error}`);
  }
}
