import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeProductVideoUrl, normalizeTvMedia } from './media-provider.js';

test('normalizes safe provider URLs into application-owned embeds', () => {
  assert.equal(normalizeTvMedia('youtube', 'https://youtu.be/dQw4w9WgXcQ').embedUrl, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.equal(normalizeTvMedia('youtube', 'https://www.youtube.com/playlist?list=PL1234567890').mediaKind, 'playlist');
  assert.equal(normalizeTvMedia('tiktok', 'https://www.tiktok.com/@shop/video/7380123456789012345').providerId, '7380123456789012345');
  assert.equal(normalizeTvMedia('instagram', 'https://www.instagram.com/reel/ABC_def12/').mediaKind, 'reel');
});

test('rejects unknown domains and unsafe product video URLs', () => {
  assert.throws(() => normalizeTvMedia('youtube', 'https://example.com/watch?v=dQw4w9WgXcQ'));
  assert.throws(() => normalizeTvMedia('instagram', 'http://instagram.com/p/ABC_def12/'));
  assert.throws(() => normalizeProductVideoUrl('https://cdn.example.com/video.mov'));
  assert.throws(() => normalizeProductVideoUrl('https://cdn.example.com/video.mov?fallback=.mp4'));
  assert.equal(normalizeProductVideoUrl('https://cdn.example.com/video.mp4?version=2'), 'https://cdn.example.com/video.mp4?version=2');
});
