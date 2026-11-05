# Geographic data and operating areas

Country containment uses geoBoundaries gbOpen ADM0 geometries retrieved on 5 November 2026 from the fixed release URLs preserved in `src/lib/geography/*.source.json`. Each source file records the original dataset metadata and attribution. These generalized geographic datasets are not legal or cadastral boundary determinations.

- Egypt: OpenStreetMap / Wambacher, Open Database License 1.0. https://www.openstreetmap.org/copyright and https://opendatacommons.org/licenses/odbl/1-0/
- Jordan: geoBoundaries, Creative Commons Attribution 4.0. https://creativecommons.org/licenses/by/4.0/
- Iraq: Natural Earth, public domain. https://www.naturalearthdata.com/about/terms-of-use/
- Dataset access and documentation: https://www.geoboundaries.org/api.html

City coordinates are explicitly curated center points, not administrative polygons. The initial Cairo operational polygon is a 50 km service coverage approximation. Every administrator-drawn zone is a custom operational polygon. Overlapping enabled zones form a union; a point in multiple zones records the lexicographically first zone ID. Polygon edges count as inside. Disabled zones cannot override an overlapping enabled zone; disable every covering zone to exclude an area.

Currency precision uses ISO 4217 minor units: EGP/USD 2; JOD/IQD 3. No exchange rates or automatic conversions exist. Country activation never rewrites historical bookings or balances. Country configuration is snapshotted on new bookings; legacy records without a snapshot remain explicitly historical, without fabricated zone provenance.
