# NAYAN Data Sources

This file is the source-of-truth record for external data used by NAYAN.

No provider should be added until its current license, terms of use, attribution requirements, and rate limits have been reviewed.

| Provider | Layer | Status | Notes |
|---|---|---|---|
| CesiumJS | 3D globe engine | Active | Open-source library; license should be reviewed when dependencies change. |
| Cesium ion | Base imagery / terrain | Phase 01 candidate | Current free-plan eligibility and non-commercial terms must be respected. |
| Natural Earth | Geographic boundaries | Planned | Public-domain geographic datasets. |
| NASA EONET | Natural events | Planned | Public natural-event metadata API. |
| NASA FIRMS | Active fires | Planned | Requires Earthdata credentials for some API access. |
| USGS | Earthquakes | Planned | Public real-time earthquake feeds. |
| CelesTrak | Satellite orbit data | Planned | Respect current usage policy and request limits. |
| OpenStreetMap | Geographic / place data | Planned | ODbL data plus separate tile-service policies. |
| TomTom | Traffic | Research | Free quota is limited and terms apply. |
| OpenSky | Aircraft | Research | Use only within current licensing/terms; review live-product restrictions before deployment. |
| AIS provider | Ships | Unselected | Provider to be chosen after licensing review. |

**Rule:** “Free” is never treated as equivalent to “unrestricted.”
