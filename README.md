## TeslaMate distance from home

`distanceFromHomeKm` uses OSRM road distance only when TeslaMate speed is a
finite number greater than zero. When parked or speed is unavailable, it retains
the last distance without calling OSRM or recalculating Haversine. The cache is
in memory and starts as null after restart; other TeslaMate fields still update. While
moving, it falls back to Haversine if OSRM is unavailable, times out, has no route,
or cannot find a road within 200 meters of either endpoint. Invalid vehicle or
home coordinates preserve the last distance (or null if none exists). Existing `lat` / `lng` parsing is unchanged.

Configure these in the bridge environment (separate from the OSRM stack):

```env
OSRM_URL=http://192.168.137.102:3002
OSRM_TIMEOUT_MS=2000
OSRM_MAX_SNAP_DISTANCE_METERS=200
```

The default URL is `http://localhost:3002`; inside the bridge container,
localhost refers to that container, so use the reachable server address or
`http://osrm:5000` on a shared Docker network. A snapping radius checks road
availability, not exact geographic bounds: points just outside an extract may
still match a nearby road inside it. Routes constrained by an extract can differ
from routes on a full-country map. No live OSRM call is needed for build checks.

## Local road routing (OSRM)

Download your regional PBF manually and place it in `./data/osrm-bangkok/`.
The previous Bangkok wget command saves it as `thailand-latest.osm.pbf`, which
remains the default filename for compatibility; the name does not determine
coverage. For a custom extract including Pathum Thani, select that area in
[BBBike Extracts](https://extract.bbbike.org/). The ready-made Bangkok extract
is not verified to cover all surrounding provinces.

Set `OSRM_DATA_DIR` for another folder and `OSRM_MAP_NAME` for a different
filename stem (without `.osm.pbf`). Use only letters, numbers, hyphens, and
underscores in the stem. Preparation writes generated files beside the map.

Start the standalone routing stack (does not start the MQTT bridge):

```sh
docker compose -f docker-compose.osrm.yml up -d
docker compose -f docker-compose.osrm.yml logs -f map-prepare osrm
```

The first start runs the OSRM car-profile MLD pipeline using your downloaded
map before starting the API on host port 3002. Compose does not download maps.
Preparation can take a long time and substantial RAM/disk space; requirements
depend on the current map. API availability begins after preparation completes.
The bind-mounted folder persists the map and prepared routing files;
subsequent starts reuse them via `${OSRM_MAP_NAME}.ready` (default `thailand-latest.ready`). No map update runs automatically.

Example with an external folder:

```sh
OSRM_DATA_DIR=/path/to/maps docker compose -f docker-compose.osrm.yml up -d
```

Use the same `OSRM_DATA_DIR` for all Compose commands for this stack.

Example request using sample Bangkok coordinates (longitude,latitude order):

```sh
curl --fail 'http://localhost:3002/route/v1/driving/100.5018,13.7563;100.5231,13.7465?overview=false'
```

Read `routes[0].distance` in meters and `routes[0].duration` in seconds. Routes
use OpenStreetMap roads and do not include live traffic by default. From a
container on the same Compose network, use `http://osrm:5000`; containers in
other stacks need a shared network or a reachable host address.

Set `OSRM_PORT` to change the published port. Both OSRM services use the same
`OSRM_IMAGE` override; its default is the upstream `latest` image. For repeatable
deployments, pin it to a tested tag or digest. When changing OSRM versions,
rebuild the routing data with that same image.

Memory is capped independently: `OSRM_PREPARE_MEMORY_LIMIT` defaults to `1g`
and `OSRM_MEMORY_LIMIT` defaults to `512m`. Swap limits equal memory limits,
so these containers cannot consume additional swap. These are resource caps,
not guaranteed requirements: Thailand preparation or serving may exceed them
and be OOM-killed. On a small host, prepare the data on a larger machine using
the same OSRM image and copy the entire prepared folder, including
`<map-name>.ready`, back before starting. Measure serving memory before tuning.

Example optional `.env` for this standalone stack:

```env
OSRM_PORT=3002
OSRM_DATA_DIR=./data/osrm-bangkok
OSRM_MAP_NAME=thailand-latest
OSRM_PREPARE_MEMORY_LIMIT=1g
OSRM_MEMORY_LIMIT=512m
```

To update the map or rebuild after an image change, stop the stack, replace the
PBF if needed, and delete only `<map-name>.ready` in your map folder. Then force
recreation so preparation runs again. Bind-mounted data is not deleted by `down`.

```sh
docker compose -f docker-compose.osrm.yml down
# Replace the map and remove <map-name>.ready in your map folder here.
docker compose -f docker-compose.osrm.yml up -d --force-recreate
```

Source: [OSRM Docker setup](https://github.com/Project-OSRM/osrm-backend#using-docker).
Map data: [Geofabrik Thailand](https://download.geofabrik.de/asia/thailand.html),
from OpenStreetMap contributors under ODbL; preserve applicable attribution
when displaying or distributing results.

```
VDO Review
https://www.youtube.com/watch?v=9lNPaSw_YSI
https://www.youtube.com/watch?v=xFBoSVY-uW4
https://www.youtube.com/watch?v=-lBEV8wjUfk
https://www.youtube.com/watch?v=PvaOxBSYhOM
```

<p float="center">
<img src="https://github.com/X-c0d3/socketio-to-mqtt-bridge/blob/main/screenshot/image1.jpg"  width="ุ600">
<img src="https://github.com/X-c0d3/socketio-to-mqtt-bridge/blob/main/screenshot/image2.jpg"  width="ุ600">
<img src="https://github.com/X-c0d3/socketio-to-mqtt-bridge/blob/main/screenshot/image3.jpg"  width="ุ600">
<img src="https://github.com/X-c0d3/socketio-to-mqtt-bridge/blob/main/screenshot/image4.jpg"  width="ุ600">
<img src="https://github.com/X-c0d3/socketio-to-mqtt-bridge/blob/main/screenshot/image5.jpg"  width="ุ600">
</p>
