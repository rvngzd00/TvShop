const azMap: Record<string, string> = {
  ə: 'e', ö: 'o', ü: 'u', ğ: 'g', ç: 'c', ş: 's', ı: 'i',
  Ə: 'e', Ö: 'o', Ü: 'u', Ğ: 'g', Ç: 'c', Ş: 's', İ: 'i'
};

export function slugify(value: string): string {
  return value
    .split('')
    .map((character) => azMap[character] ?? character)
    .join('')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
}
