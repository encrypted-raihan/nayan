# NAYAN Data Sources

## Aircraft

NAYAN uses the public **ADSB.lol Open Data API** for live aircraft position snapshots. The API is available to everyone and is licensed under **ODbL 1.0**.

NAYAN queries small regional circles around India through the server-side `/api/aircraft` proxy, normalizes the response into `NayanAircraft`, and renders the positions locally in Cesium.

The aircraft layer intentionally avoids OpenSky in the initial release because OpenSky's current terms require written agreement for operational use of its REST API, including non-profit use.

Source: https://www.adsb.lol/docs/open-data/api/
License: https://opendatacommons.org/licenses/odbl/1-0/

## Attribution

Aircraft data is attributed in the NAYAN interface as **ADSB.lol** and linked back to the source.
