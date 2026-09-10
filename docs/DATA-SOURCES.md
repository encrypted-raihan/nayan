# NAYAN Data Sources

## Aircraft

NAYAN uses the public **ADSB.lol Open Data API** for live aircraft position snapshots. The API is available to everyone and its public data/API are licensed under **ODbL 1.0**.

### Collection strategy

Aircraft collection is deliberately **south-first with all-India corridor coverage** rather than a full-India scan on every request. Priority coverage is centered on:

- Kochi / Kerala
- Bengaluru / Karnataka
- Chennai / Tamil Nadu
- Coimbatore / Tamil Nadu
- Goa
- Ahmedabad / Gujarat
- Mumbai / Maharashtra
- Hyderabad / Telangana
- Delhi / NCR
- Patna / Bihar
- Bhubaneswar / Odisha
- Kolkata / West Bengal
- Guwahati / Northeast

Kerala, Karnataka, Tamil Nadu and Goa get strong early coverage. Western, northern, eastern and northeastern hubs then fill the right side of the India view so the globe reads as a connected national flight network rather than a southern-only map.

NAYAN queries **one region per refresh cycle** and accumulates successful regional snapshots. This avoids the long multi-request wait that made the Aircraft toggle feel frozen and reduces burst pressure on ADSB.lol. Aircraft are deduplicated by ICAO24 before being sent to Cesium.

The browser creates the aircraft primitive immediately, then receives the first successful regional snapshot without blocking the globe. Subsequent 10-second polls gradually add/update the other priority regions. A throttled upstream region does not erase already collected aircraft.

The merged payload is capped at **600 freshest aircraft** before rendering. This keeps Cesium responsive while still providing enough density to make India feel active across the full country.

The production architecture should eventually move this accumulation into a persistent collector/cache rather than relying on process-local state, because serverless function instances are not a durable shared store.

Source: https://www.adsb.lol/docs/open-data/api/
License: https://opendatacommons.org/licenses/odbl/1-0/

## Attribution

Aircraft data is attributed in the NAYAN interface as **ADSB.lol** and linked back to the source.
