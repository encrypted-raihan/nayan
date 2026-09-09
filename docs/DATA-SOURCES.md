# NAYAN Data Sources

## Aircraft

NAYAN uses the public **ADSB.lol Open Data API** for live aircraft position snapshots. The API is available to everyone and its public data/API are licensed under **ODbL 1.0**. ADSB.lol also states that its API rate limits are dynamic based on environment load, so NAYAN uses a controlled aircraft collector.

### India collection strategy

The aircraft layer uses an **overlapping India-region grid** through the server-side `/api/aircraft` proxy:

- 9 geographic cells are queried sequentially rather than concurrently.
- Each cell uses a 300 NM radius.
- A deliberate delay is inserted between upstream requests.
- Aircraft from successful cells are merged and deduplicated by ICAO24.
- Successful snapshots are cached for 60 seconds.
- If a refresh fails, the last successful snapshot can remain available for up to 5 minutes.
- The browser never calls ADSB.lol directly.

This provides substantially broader India coverage than a single 250 NM center query while avoiding a burst of simultaneous upstream requests.

Aircraft positions are normalized into `NayanAircraft` and rendered locally in Cesium with smooth interpolation between snapshots.

The aircraft layer intentionally avoids OpenSky in the initial release because OpenSky's current terms require written agreement for operational use of its REST API, including non-profit use.

Source: https://www.adsb.lol/docs/open-data/api/
License: https://opendatacommons.org/licenses/odbl/1-0/

## Attribution

Aircraft data is attributed in the NAYAN interface as **ADSB.lol** and linked back to the source.
