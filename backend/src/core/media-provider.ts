import { z } from 'zod';

export const tvProviderSchema = z.enum(['youtube', 'tiktok', 'instagram']);
export type TvProvider = z.infer<typeof tvProviderSchema>;

export type NormalizedTvMedia = {
  provider: TvProvider;
  sourceUrl: string;
  providerId: string;
  mediaKind: 'video' | 'playlist' | 'post' | 'reel';
  embedUrl: string;
};

function parseUrl(value: string): URL {
  const input = value.trim();
  if (!input || input.length > 2_000) throw new Error('Media URL etibarlı deyil');
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('Tam HTTPS media URL-i daxil edin');
  }
  if (url.protocol !== 'https:') throw new Error('Media URL yalnız HTTPS ola bilər');
  return url;
}

function youtube(url: URL): NormalizedTvMedia {
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  if (!['youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)) throw new Error('YouTube URL gözlənilir');
  const playlistId = url.searchParams.get('list');
  if (playlistId && /^[A-Za-z0-9_-]{10,80}$/.test(playlistId)) {
    return {
      provider: 'youtube', sourceUrl: url.href, providerId: playlistId, mediaKind: 'playlist',
      embedUrl: `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(playlistId)}`
    };
  }
  const segments = url.pathname.split('/').filter(Boolean);
  const candidate = host === 'youtu.be' ? segments[0] : url.searchParams.get('v') || (['shorts', 'embed', 'live'].includes(segments[0] || '') ? segments[1] : '');
  if (!candidate || !/^[A-Za-z0-9_-]{6,20}$/.test(candidate)) throw new Error('YouTube video və ya playlist URL-i etibarlı deyil');
  return {
    provider: 'youtube', sourceUrl: url.href, providerId: candidate, mediaKind: 'video',
    embedUrl: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(candidate)}`
  };
}

function tiktok(url: URL): NormalizedTvMedia {
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  if (!['tiktok.com', 'm.tiktok.com'].includes(host)) throw new Error('TikTok URL gözlənilir');
  const match = url.pathname.match(/\/video\/(\d{10,30})/);
  if (!match?.[1]) throw new Error('Açıq TikTok video URL-i etibarlı deyil');
  return {
    provider: 'tiktok', sourceUrl: url.href, providerId: match[1], mediaKind: 'video',
    embedUrl: `https://www.tiktok.com/player/v1/${match[1]}?autoplay=0&loop=0&music_info=1&description=1`
  };
}

function instagram(url: URL): NormalizedTvMedia {
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  if (!['instagram.com', 'm.instagram.com'].includes(host)) throw new Error('Instagram URL gözlənilir');
  const match = url.pathname.match(/^\/(p|reel|tv)\/([A-Za-z0-9_-]{5,40})/);
  if (!match?.[2]) throw new Error('Açıq Instagram post və ya reel URL-i etibarlı deyil');
  return {
    provider: 'instagram', sourceUrl: url.href, providerId: match[2], mediaKind: match[1] === 'p' ? 'post' : 'reel',
    embedUrl: `https://www.instagram.com/${match[1]}/${match[2]}/embed/captioned/`
  };
}

export function normalizeTvMedia(provider: TvProvider, value: string): NormalizedTvMedia {
  const url = parseUrl(value);
  if (provider === 'youtube') return youtube(url);
  if (provider === 'tiktok') return tiktok(url);
  return instagram(url);
}

export function normalizeProductVideoUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const url = parseUrl(value);
  if (!/\.(?:mp4|webm)$/i.test(url.pathname)) {
    throw new Error('Məhsul videosu MP4 və ya WEBM HTTPS URL-i olmalıdır');
  }
  return url.href;
}
