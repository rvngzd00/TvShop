import fs from 'node:fs';
import path from 'node:path';
import pngjs from 'pngjs';
import { fileURLToPath } from 'node:url';

const { PNG } = pngjs;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brand = path.join(root, 'assets', 'brand');
const sourcePath = path.join(brand, 'gundelik-baki-logo-original.png');
const source = PNG.sync.read(fs.readFileSync(sourcePath));

if (source.width !== 2000 || source.height !== 1620) {
  throw new Error('TVShop mənbə logosunun ölçüsü gözləniləndən fərqlidir. Crop koordinatlarını yeniləyin.');
}

function crop(image, x, y, width, height, background = [0, 0, 0, 0]) {
  const output = new PNG({ width, height });
  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const target = (py * width + px) * 4;
      const sx = x + px;
      const sy = y + py;
      if (sx >= 0 && sx < image.width && sy >= 0 && sy < image.height) {
        const input = (sy * image.width + sx) * 4;
        for (let channel = 0; channel < 4; channel += 1) output.data[target + channel] = image.data[input + channel];
      } else {
        for (let channel = 0; channel < 4; channel += 1) output.data[target + channel] = background[channel];
      }
    }
  }
  return output;
}

function resize(image, width, height) {
  const output = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(image.height - 1, Math.max(0, Math.round(((y + 0.5) * image.height) / height - 0.5)));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(image.width - 1, Math.max(0, Math.round(((x + 0.5) * image.width) / width - 0.5)));
      const input = (sourceY * image.width + sourceX) * 4;
      const target = (y * width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) output.data[target + channel] = image.data[input + channel];
    }
  }
  return output;
}

function squareMark(size) {
  const canvas = new PNG({ width: size, height: size });
  canvas.data.fill(255);
  const glyph = crop(source, 194, 540, 131, 318);
  const glyphHeight = Math.round(size * 0.78);
  const glyphWidth = Math.round((glyph.width / glyph.height) * glyphHeight);
  const scaled = resize(glyph, glyphWidth, glyphHeight);
  const offsetX = Math.floor((size - glyphWidth) / 2);
  const offsetY = Math.floor((size - glyphHeight) / 2);
  for (let y = 0; y < glyphHeight; y += 1) {
    for (let x = 0; x < glyphWidth; x += 1) {
      const input = (y * glyphWidth + x) * 4;
      const alpha = scaled.data[input + 3] / 255;
      const target = ((offsetY + y) * size + offsetX + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        canvas.data[target + channel] = Math.round(scaled.data[input + channel] * alpha + 255 * (1 - alpha));
      }
      canvas.data[target + 3] = 255;
    }
  }
  return canvas;
}

function write(name, image) {
  fs.writeFileSync(path.join(brand, name), PNG.sync.write(image, { colorType: 6 }));
}

const logo = crop(source, 154, 500, 1706, 526);
const whiteLogo = PNG.sync.read(PNG.sync.write(logo));
for (let index = 0; index < whiteLogo.data.length; index += 4) {
  if (whiteLogo.data[index + 3] === 0) continue;
  whiteLogo.data[index] = 255;
  whiteLogo.data[index + 1] = 255;
  whiteLogo.data[index + 2] = 255;
}

write('gundelik-baki-logo.png', logo);
write('gundelik-baki-logo-white.png', whiteLogo);
write('gundelik-baki-mark.png', squareMark(512));
write('favicon-32.png', squareMark(32));
write('apple-touch-icon.png', squareMark(180));
write('icon-192.png', squareMark(192));
write('icon-512.png', squareMark(512));

console.log('TVShop logo və favicon assetləri hazırlandı.');
