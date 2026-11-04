// Explicitly maintained operating-location catalogue. City-center coordinates,
// not service boundaries; additions require review. Egypt's 27 governorates.
export const egyptLocations = {
  Cairo: { Cairo: [30.0444, 31.2357], "New Cairo": [30.0074, 31.4913] },
  Alexandria: { Alexandria: [31.2001, 29.9187] },
  Giza: { Giza: [30.0131, 31.2089], "6th of October": [29.9285, 30.9188] },
  Dakahlia: { Mansoura: [31.0409, 31.3785] },
  "Red Sea": { Hurghada: [27.2579, 33.8116] },
  Beheira: { Damanhur: [31.0341, 30.4682] },
  Faiyum: { Faiyum: [29.3084, 30.8428] },
  Gharbia: { Tanta: [30.7865, 31.0004] },
  Ismailia: { Ismailia: [30.5965, 32.2715] },
  Monufia: { "Shibin El Kom": [30.5549, 31.0124] },
  Minya: { Minya: [28.1099, 30.7503] },
  Qalyubia: { Banha: [30.4667, 31.1833] },
  "New Valley": { Kharga: [25.439, 30.5586] },
  Suez: { Suez: [29.9668, 32.5498] },
  Aswan: { Aswan: [24.0889, 32.8998] },
  Asyut: { Asyut: [27.1809, 31.1837] },
  "Beni Suef": { "Beni Suef": [29.0661, 31.0994] },
  "Port Said": { "Port Said": [31.2653, 32.3019] },
  Damietta: { Damietta: [31.4175, 31.8144] },
  Sharqia: { Zagazig: [30.5877, 31.502] },
  "South Sinai": {
    "El Tor": [28.2417, 33.6222],
    "Sharm El Sheikh": [27.9158, 34.33],
  },
  "Kafr El Sheikh": { "Kafr El Sheikh": [31.1107, 30.9388] },
  Matrouh: { "Marsa Matrouh": [31.3543, 27.2373] },
  Luxor: { Luxor: [25.6872, 32.6396] },
  Qena: { Qena: [26.1551, 32.716] },
  "North Sinai": { Arish: [31.1316, 33.7984] },
  Sohag: { Sohag: [26.5569, 31.6948] },
};
export const mapDefaults = {
  basemapProvider: "openfreemap",
  mapStyle: "standard",
  country: "Egypt",
  governorate: "Cairo",
  city: "Cairo",
  initialZoom: 12,
  autoFitDrivers: true,
  showVehicleMarkers: true,
  showDriverNames: false,
  driverStatusFilter: "all",
  vehicleCategoryFilter: "all",
  locationRefreshSeconds: 15,
};
export function cityCenter(settings = mapDefaults) {
  const [lat, lng] =
    egyptLocations[settings.governorate]?.[settings.city] ||
    egyptLocations.Cairo.Cairo;
  return { lat, lng };
}
export const mapStyles = [
  { value: "standard", label: "Standard" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];
export const cartoConfigured = Boolean(
  process.env.NEXT_PUBLIC_CARTO_BASEMAP_KEY,
);
export function basemapStyle(provider, style) {
  if (provider === "carto" && cartoConfigured) {
    const name =
      { standard: "voyager", light: "positron", dark: "dark-matter" }[style] ||
      "voyager";
    return `https://basemaps.cartocdn.com/gl/${name}-gl-style/style.json?key=${encodeURIComponent(process.env.NEXT_PUBLIC_CARTO_BASEMAP_KEY)}`;
  }
  return `https://tiles.openfreemap.org/styles/${{ standard: "liberty", light: "positron", dark: "dark" }[style] || "liberty"}`;
}
export function mapRequest(url) {
  const parsed = new URL(
    url,
    typeof window === "undefined" ? "https://localhost" : window.location.href,
  );
  if (
    cartoConfigured &&
    (parsed.hostname === "basemaps.cartocdn.com" ||
      parsed.hostname.endsWith(".basemaps.cartocdn.com"))
  )
    parsed.searchParams.set("key", process.env.NEXT_PUBLIC_CARTO_BASEMAP_KEY);
  return { url: parsed.href };
}
export const DRIVER_STALE_MS = 90000;
