# NAYAN Data Sources

## Aircraft

NAYAN uses the public **ADSB.lol Open Data API** for live aircraft position snapshots. The API is available to everyone and its public data/API are licensed under **ODbL 1.0**.

### Collection strategy

Aircraft collection is deliberately **south-first** rather than a full-India scan on every request. Priority coverage is centered on:

- Kochi / Kerala
- Bengaluru / Karnataka
- Chennai / Tamil Nadu
- Hyderabad
- Mumbai
- Kolkata
- Delhi

The first three centers give southern India the strongest practical coverage. The remaining major hubs create national flight-corridor context without trying to reconstruct the entire ADSB.lol globe.

NAYAN queries **one region per refresh cycle** and accumulates successful regional snapshots. This avoids the long 7–9 request wait that made the Aircraft toggle feel frozen and reduces burst pressure on ADSB.lol. Aircraft are deduplicated by ICAO24 before being sent to Cesium.

The browser receives the first successful regional snapshot quickly, then subsequent 15-second polls gradually add/update the other priority regions. A throttled upstream region does not erase already collected aircraft.

The production architecture should eventually move this accumulation into a persistent collector/cache rather than relying on process-local state, because serverless function instances are not a durable shared store.

Source: https://www.adsb.lol/docs/open-data/api/
License: https://opendatacommons.org/licenses/odbl/1-0/

## Attribution

Aircraft data is attributed in the NAYAN interface as **ADSB.lol** and linked back to the source.
