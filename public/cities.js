// Offline city table used to light up the visitor's city on the globe.
// No network request is made: the initial guess comes from the browser's
// time zone, and precise location is only used after explicit consent.

export const CITIES = [
  ['Bogotá', 'Colombia', 4.711, -74.0721, 'America/Bogota'],
  ['Ciudad de México', 'México', 19.4326, -99.1332, 'America/Mexico_City'],
  ['Monterrey', 'México', 25.6866, -100.3161, 'America/Monterrey'],
  ['Tijuana', 'México', 32.5149, -117.0382, 'America/Tijuana'],
  ['Lima', 'Perú', -12.0464, -77.0428, 'America/Lima'],
  ['Quito', 'Ecuador', -0.1807, -78.4678, 'America/Guayaquil'],
  ['Caracas', 'Venezuela', 10.4806, -66.9036, 'America/Caracas'],
  ['La Paz', 'Bolivia', -16.4897, -68.1193, 'America/La_Paz'],
  ['Santiago', 'Chile', -33.4489, -70.6693, 'America/Santiago'],
  ['Buenos Aires', 'Argentina', -34.6037, -58.3816, 'America/Argentina/Buenos_Aires'],
  ['Montevideo', 'Uruguay', -34.9011, -56.1645, 'America/Montevideo'],
  ['Asunción', 'Paraguay', -25.2637, -57.5759, 'America/Asuncion'],
  ['São Paulo', 'Brasil', -23.5505, -46.6333, 'America/Sao_Paulo'],
  ['Panamá', 'Panamá', 8.9824, -79.5199, 'America/Panama'],
  ['San José', 'Costa Rica', 9.9281, -84.0907, 'America/Costa_Rica'],
  ['Guatemala', 'Guatemala', 14.6349, -90.5069, 'America/Guatemala'],
  ['San Salvador', 'El Salvador', 13.6929, -89.2182, 'America/El_Salvador'],
  ['Tegucigalpa', 'Honduras', 14.0723, -87.1921, 'America/Tegucigalpa'],
  ['Managua', 'Nicaragua', 12.1364, -86.2514, 'America/Managua'],
  ['Santo Domingo', 'Rep. Dominicana', 18.4861, -69.9312, 'America/Santo_Domingo'],
  ['San Juan', 'Puerto Rico', 18.4655, -66.1057, 'America/Puerto_Rico'],
  ['La Habana', 'Cuba', 23.1136, -82.3666, 'America/Havana'],
  ['New York', 'United States', 40.7128, -74.006, 'America/New_York'],
  ['Chicago', 'United States', 41.8781, -87.6298, 'America/Chicago'],
  ['Denver', 'United States', 39.7392, -104.9903, 'America/Denver'],
  ['Phoenix', 'United States', 33.4484, -112.074, 'America/Phoenix'],
  ['Los Angeles', 'United States', 34.0522, -118.2437, 'America/Los_Angeles'],
  ['Anchorage', 'United States', 61.2181, -149.9003, 'America/Anchorage'],
  ['Honolulu', 'United States', 21.3069, -157.8583, 'Pacific/Honolulu'],
  ['Toronto', 'Canada', 43.6532, -79.3832, 'America/Toronto'],
  ['Vancouver', 'Canada', 49.2827, -123.1207, 'America/Vancouver'],
  ['Halifax', 'Canada', 44.6488, -63.5752, 'America/Halifax'],
  ['London', 'United Kingdom', 51.5072, -0.1276, 'Europe/London'],
  ['Dublin', 'Ireland', 53.3498, -6.2603, 'Europe/Dublin'],
  ['Lisboa', 'Portugal', 38.7223, -9.1393, 'Europe/Lisbon'],
  ['Madrid', 'España', 40.4168, -3.7038, 'Europe/Madrid'],
  ['Paris', 'France', 48.8566, 2.3522, 'Europe/Paris'],
  ['Brussels', 'Belgium', 50.8503, 4.3517, 'Europe/Brussels'],
  ['Amsterdam', 'Netherlands', 52.3676, 4.9041, 'Europe/Amsterdam'],
  ['Berlin', 'Germany', 52.52, 13.405, 'Europe/Berlin'],
  ['Zürich', 'Switzerland', 47.3769, 8.5417, 'Europe/Zurich'],
  ['Roma', 'Italia', 41.9028, 12.4964, 'Europe/Rome'],
  ['Vienna', 'Austria', 48.2082, 16.3738, 'Europe/Vienna'],
  ['Prague', 'Czechia', 50.0755, 14.4378, 'Europe/Prague'],
  ['Warsaw', 'Poland', 52.2297, 21.0122, 'Europe/Warsaw'],
  ['Copenhagen', 'Denmark', 55.6761, 12.5683, 'Europe/Copenhagen'],
  ['Oslo', 'Norway', 59.9139, 10.7522, 'Europe/Oslo'],
  ['Stockholm', 'Sweden', 59.3293, 18.0686, 'Europe/Stockholm'],
  ['Helsinki', 'Finland', 60.1699, 24.9384, 'Europe/Helsinki'],
  ['Tallinn', 'Estonia', 59.437, 24.7536, 'Europe/Tallinn'],
  ['Riga', 'Latvia', 56.9496, 24.1052, 'Europe/Riga'],
  ['Vilnius', 'Lithuania', 54.6872, 25.2797, 'Europe/Vilnius'],
  ['Kyiv', 'Ukraine', 50.4501, 30.5234, 'Europe/Kyiv'],
  ['Athens', 'Greece', 37.9838, 23.7275, 'Europe/Athens'],
  ['Istanbul', 'Türkiye', 41.0082, 28.9784, 'Europe/Istanbul'],
  ['Moscow', 'Russia', 55.7558, 37.6173, 'Europe/Moscow'],
  ['Casablanca', 'Morocco', 33.5731, -7.5898, 'Africa/Casablanca'],
  ['Lagos', 'Nigeria', 6.5244, 3.3792, 'Africa/Lagos'],
  ['Cairo', 'Egypt', 30.0444, 31.2357, 'Africa/Cairo'],
  ['Nairobi', 'Kenya', -1.2921, 36.8219, 'Africa/Nairobi'],
  ['Johannesburg', 'South Africa', -26.2041, 28.0473, 'Africa/Johannesburg'],
  ['Tel Aviv', 'Israel', 32.0853, 34.7818, 'Asia/Jerusalem'],
  ['Riyadh', 'Saudi Arabia', 24.7136, 46.6753, 'Asia/Riyadh'],
  ['Dubai', 'UAE', 25.2048, 55.2708, 'Asia/Dubai'],
  ['Karachi', 'Pakistan', 24.8607, 67.0011, 'Asia/Karachi'],
  ['Mumbai', 'India', 19.076, 72.8777, 'Asia/Kolkata'],
  ['Bangkok', 'Thailand', 13.7563, 100.5018, 'Asia/Bangkok'],
  ['Ho Chi Minh City', 'Vietnam', 10.8231, 106.6297, 'Asia/Ho_Chi_Minh'],
  ['Jakarta', 'Indonesia', -6.2088, 106.8456, 'Asia/Jakarta'],
  ['Singapore', 'Singapore', 1.3521, 103.8198, 'Asia/Singapore'],
  ['Manila', 'Philippines', 14.5995, 120.9842, 'Asia/Manila'],
  ['Hong Kong', 'China', 22.3193, 114.1694, 'Asia/Hong_Kong'],
  ['Shanghai', 'China', 31.2304, 121.4737, 'Asia/Shanghai'],
  ['Taipei', 'Taiwan', 25.033, 121.5654, 'Asia/Taipei'],
  ['Seoul', 'South Korea', 37.5665, 126.978, 'Asia/Seoul'],
  ['Tokyo', 'Japan', 35.6762, 139.6503, 'Asia/Tokyo'],
  ['Sydney', 'Australia', -33.8688, 151.2093, 'Australia/Sydney'],
  ['Melbourne', 'Australia', -37.8136, 144.9631, 'Australia/Melbourne'],
  ['Perth', 'Australia', -31.9505, 115.8605, 'Australia/Perth'],
  ['Auckland', 'New Zealand', -36.8485, 174.7633, 'Pacific/Auckland']
].map(([name, country, lat, lon, tz]) => ({ name, country, lat, lon, tz }));

// Legacy IANA names some browsers still report.
const ALIASES = { 'Asia/Calcutta': 'Asia/Kolkata', 'Europe/Kiev': 'Europe/Kyiv', 'Asia/Saigon': 'Asia/Ho_Chi_Minh', 'America/Buenos_Aires': 'America/Argentina/Buenos_Aires', 'US/Eastern': 'America/New_York', 'US/Central': 'America/Chicago', 'US/Mountain': 'America/Denver', 'US/Pacific': 'America/Los_Angeles' };

export const DEFAULT_CITY = CITIES[0];

// Execution hubs drawn as arcs from the visitor's city.
export const HUBS = [
  { name: 'Bogotá', code: 'BOG', lat: 4.711, lon: -74.0721 },
  { name: 'Virginia', code: 'IAD', lat: 39.0438, lon: -77.4874 },
  { name: 'Frankfurt', code: 'FRA', lat: 50.1109, lon: 8.6821 }
];

const toRad = deg => deg * Math.PI / 180;
export function distanceKm(a, b) {
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function nearestCity(lat, lon) {
  let best = CITIES[0], bestDistance = Infinity;
  for (const city of CITIES) {
    const d = distanceKm({ lat, lon }, city);
    if (d < bestDistance) { best = city; bestDistance = d; }
  }
  return { city: best, distance: bestDistance };
}

// Resolve the visitor's city from the browser time zone (no permission prompt, no network).
export function cityFromTimezone() {
  let tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { tz = ''; }
  tz = ALIASES[tz] || tz;
  const exact = CITIES.find(city => city.tz === tz);
  if (exact) return { city: exact, source: 'timezone', tz };
  // Unknown zone: approximate longitude from the UTC offset and stay on the same continent.
  const continent = tz.split('/')[0];
  const approxLon = -new Date().getTimezoneOffset() / 4;
  const pool = CITIES.filter(city => city.tz.startsWith(continent + '/'));
  const candidates = pool.length ? pool : CITIES;
  const guess = candidates.reduce((a, c) => Math.abs(c.lon - approxLon) < Math.abs(a.lon - approxLon) ? c : a, candidates[0]);
  return tz ? { city: guess, source: 'offset', tz } : { city: DEFAULT_CITY, source: 'default', tz };
}

export const formatCoords = (lat, lon, digits = 2) => `${Math.abs(lat).toFixed(digits)}° ${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lon).toFixed(digits)}° ${lon >= 0 ? 'E' : 'W'}`;
