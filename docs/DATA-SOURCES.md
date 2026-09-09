# NAYAN Data Sources

## Aircraft

NAYAN uses the public **ADSB.lol Open Data API** for live aircraft position snapshots. The API is available to everyone and its public data/API are licensed under **ODbL 1.0**. ADSB.lol also states that its API rate limits are dynamic based on environment load, so NAYAN deliberately keeps its initial aircraft collector conservative.

### Initial collection strategy

The first aircraft release uses **one 250 NM India-core query** through the server-side `/api/aircraft` proxy. The server caches successful snapshots for 30 seconds and can serve a last-known snapshot for up to 5 minutes when the upstream temporarily returns `420`/`429` or another transient failure.

The browser polls NAYAN every 30 seconds; it never calls ADSB.lol directly. Aircraft positions are normalized into `NayanAircraft` and rendered locally in Cesium with smooth interpolation between snapshots.

This is intentionally a foundation rather than final India-wide coverage. If NAYAN needs broader coverage, the next step should be a dedicated collector/cache service with controlled regional fan-out—not increasing simultaneous browser/API requests.

The aircraft layer intentionally avoids OpenSky in the initial release because OpenSky's current terms require written agreement for operational use of its REST API, including non-profit use.

Source: https://www.adsb.lol/docs/open-data/api/
License: https://opendatacommons.org/licenses/odbl/1-0/

## Attribution

Aircraft data is attributed in the NAYAN interface as **ADSB.lol** and linked back to the source.
