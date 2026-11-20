// Realtime Database projekat koji koristi Android aplikacija E:\app_balon.
export const ANDROID_DATABASE_URL =
  'https://cool-kit-330117-default-rtdb.europe-west1.firebasedatabase.app';

// QR URL /restoran mapira na Firebase čvor /Restoran.
// URL ID-jevi treba da odgovaraju root čvorovima, malim slovima.
export function getRootNode(slug) {
  const decoded = decodeURIComponent(slug || '').trim();
  return decoded ? decoded[0].toLocaleUpperCase('bs') + decoded.slice(1) : '';
}

// PicerijaBordo postaje "Picerija bordo" samo za prikaz; Firebase čvor ostaje nepromijenjen.
export function getRestaurantDisplayName(rootNode) {
  return rootNode
    .replace(/([a-zčćžšđ])([A-ZČĆŽŠĐ])/gu, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((word, index) => index === 0 ? word : word.toLocaleLowerCase('bs'))
    .join(' ');
}
