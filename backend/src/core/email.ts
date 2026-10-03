import { env } from '../config/env.js';
import { AppError } from './errors.js';

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type EmailDelivery = {
  accepted: boolean;
  provider: 'disabled' | 'resend';
  id: string | null;
};

const developmentOutbox: EmailMessage[] = [];

function escapeEmailHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]!);
}

function safeEmailUrl(value: string): string {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported protocol');
    return escapeEmailHtml(url.toString());
  } catch {
    throw new AppError(500, 'EMAIL_TEMPLATE_INVALID_URL', 'E-poçt keçidi etibarsızdır');
  }
}

export function getDevelopmentEmailOutbox(): readonly EmailMessage[] {
  return developmentOutbox;
}

export function clearDevelopmentEmailOutbox(): void {
  developmentOutbox.length = 0;
}

export async function sendEmail(message: EmailMessage): Promise<EmailDelivery> {
  if (env.EMAIL_PROVIDER === 'disabled') {
    if (env.NODE_ENV !== 'production') developmentOutbox.push(structuredClone(message));
    return { accepted: false, provider: 'disabled', id: null };
  }

  let response: Response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        ...(message.text ? { text: message.text } : {}),
        ...(env.EMAIL_REPLY_TO ? { reply_to: env.EMAIL_REPLY_TO } : {})
      }),
      signal: AbortSignal.timeout(env.EMAIL_TIMEOUT_MS)
    });
  } catch (error) {
    throw new AppError(503, 'EMAIL_DELIVERY_FAILED', 'E-poçtu göndərmək mümkün olmadı', {
      reason: error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network'
    });
  }

  if (!response.ok) {
    throw new AppError(503, 'EMAIL_DELIVERY_FAILED', 'E-poçtu göndərmək mümkün olmadı', {
      providerStatus: response.status,
      providerRequestId: response.headers.get('x-request-id')
    });
  }

  const payload = await response.json().catch(() => null) as { id?: unknown } | null;
  return {
    accepted: true,
    provider: 'resend',
    id: typeof payload?.id === 'string' ? payload.id : null
  };
}

type BrandedEmailOptions = {
  eyebrow?: string;
  title: string;
  text: string;
  actionLabel?: string;
  actionUrl?: string;
  note?: string;
};

export function brandedEmailTemplate(options: BrandedEmailOptions): string {
  const action = options.actionLabel && options.actionUrl
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0 24px"><tr><td style="border-radius:8px;background:#174ddd"><a href="${safeEmailUrl(options.actionUrl)}" style="display:inline-block;padding:14px 24px;color:#fff;text-decoration:none;font-size:14px;font-weight:800">${escapeEmailHtml(options.actionLabel)}</a></td></tr></table>`
    : '';
  const note = options.note
    ? `<p style="margin:24px 0 0;padding-top:20px;border-top:1px solid #e5e9f2;color:#72798a;font-size:12px;line-height:1.65">${escapeEmailHtml(options.note)}</p>`
    : '';
  return `<!doctype html><html lang="az"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f1f4fa;font-family:Arial,Helvetica,sans-serif;color:#111b2f"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f4fa"><tr><td style="padding:28px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;overflow:hidden;background:#fff;border:1px solid #e1e6f0;border-radius:18px;box-shadow:0 18px 50px rgba(7,31,82,.08)"><tr><td style="height:7px;background:linear-gradient(90deg,#174ddd 0 74%,#cf0036 74% 100%)"></td></tr><tr><td style="padding:30px 34px 10px"><div style="display:inline-block;padding:9px 13px;color:#fff;background:#0a245b;border-radius:8px;font-size:17px;font-weight:900;letter-spacing:-.02em">TVShop</div></td></tr><tr><td style="padding:18px 34px 34px"><p style="margin:0 0 8px;color:#cf0036;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase">${escapeEmailHtml(options.eyebrow || 'TVSHOP')}</p><h1 style="margin:0 0 16px;color:#111b2f;font-size:27px;line-height:1.2">${escapeEmailHtml(options.title)}</h1><p style="margin:0;color:#4f586b;font-size:15px;line-height:1.75">${escapeEmailHtml(options.text).replaceAll('\n', '<br>')}</p>${action}${note}</td></tr><tr><td style="padding:18px 34px;color:#8a91a0;background:#f8f9fc;font-size:11px;line-height:1.6">© ${new Date().getFullYear()} TVShop · Bu avtomatik bildirişə cavab verməyiniz tələb olunmur.</td></tr></table></td></tr></table></body></html>`;
}

export function authEmailTemplate(title: string, text: string, actionLabel: string, actionUrl: string): string {
  return brandedEmailTemplate({
    eyebrow: 'HESAB TƏHLÜKƏSİZLİYİ',
    title,
    text,
    actionLabel,
    actionUrl,
    note: 'Bu əməliyyatı siz tələb etməmisinizsə, keçiddən istifadə etməyin və mesajı nəzərə almayın.'
  });
}

export function customerWelcomeEmailTemplate(firstName: string, accountUrl: string): string {
  return brandedEmailTemplate({
    eyebrow: 'XOŞ GƏLMİSİNİZ',
    title: 'TVShop hesabınız hazırdır',
    text: `Salam ${firstName}, qeydiyyatınız uğurla tamamlandı. İndi seçilmiş məhsulları saxlaya, sifarişlərinizi izləyə və Bakı Club imkanlarından istifadə edə bilərsiniz.`,
    actionLabel: 'Hesabıma keç',
    actionUrl: accountUrl,
    note: 'Hesab təhlükəsizliyiniz üçün şifrənizi heç kimlə paylaşmayın.'
  });
}

export function vendorWelcomeEmailTemplate(firstName: string, businessName: string, portalUrl: string): string {
  return brandedEmailTemplate({
    eyebrow: 'PARTNYOR QEYDİYYATI',
    title: 'Satıcı kabinetiniz yaradıldı',
    text: `Salam ${firstName}, ${businessName} üçün partnyorluq müraciətiniz qeydə alındı. Satıcı kabinetinə daxil olub məhsullarınızı indidən hazırlaya bilərsiniz. Məhsullar yalnız administrator satıcı hesabınızı və məhsulları təsdiqlədikdən sonra saytda görünəcək.`,
    actionLabel: 'Satıcı kabinetinə keç',
    actionUrl: portalUrl,
    note: 'Müraciət statusunuz dəyişdikdə kabinetdə bildiriş görəcəksiniz.'
  });
}
