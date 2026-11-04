// MapLibre 6.16 performs Arabic shaping and bidi ordering in its worker.
// Keep logical Unicode text intact; reversing strings breaks mixed-script names.
function usesName(field) {
  if (Array.isArray(field))
    return (field[0] === "get" && /^name(?::|_|$)/.test(field[1])) || field.some(usesName);
  return typeof field === "string" && /\{name(?::[^}]+|_[^}]+)?\}/.test(field);
}

export function arabicMapStyle(_previous, style) {
  return {
    ...style,
    layers: style.layers.map((layer) => {
      const original = layer.layout?.["text-field"];
      if (layer.type !== "symbol" || !usesName(original)) return layer;
      // OpenMapTiles may omit name:ar; its original name is Arabic in Egypt.
      // Leave shield refs, icons, fonts, geometry and non-label layers intact.
      const fallback = typeof original === "string" ? ["get", "name"] : original;
      return {
        ...layer,
        layout: {
          ...layer.layout,
          "text-field": ["case",
            ["!=", ["coalesce", ["get", "name:ar"], ""], ""], ["get", "name:ar"],
            ["!=", ["coalesce", ["get", "name"], ""], ""], ["get", "name"],
            fallback,
          ],
        },
      };
    }),
  };
}
