# URL parameters

Add them to the dashboard address, for example `http://localhost:5173/?focus=studio&tour=off`.

| Parameter | Values | What it does |
| --- | --- | --- |
| `live` | `off` | Forces the labelled demo projects |
| `service` | an address | Points at another local service, for example `http://127.0.0.1:5000` |
| `project` | a project id | Opens that project |
| `focus` | `planning`, `development`, `review`, `rest`, `studio`, `orb`, `cart`, `launchpad`, `library`, `sky`, `system` | Frames one place. `sky` is the lift-off view, `system` opens the solar system |
| `scene` | `robots` | Shows all the robot shapes |
| `tour` | `off` | Turns the idle tour off |
| `quality` | `auto`, `high`, `balanced`, `fast`, `lite` | Forces a quality level |
| `fx` | `noao`, `nobloom`, `noshadow`, `lowdpr`, `noweather`, `nofilm` (comma separated) | Switches effects off, to measure what each one costs |
| `off` | `vents`, `decals`, `holograms`, `pulses`, `machines`, `screens` (comma separated) | Turns parts of the moving scenery off, for speed checks |

## Browser checks
`window.__camera` is the camera, `window.__sound.level()` reads the output level, `window.__gestureLog` lists the gestures
that clicks started, and `window.__weld.tipError` reads the welding robot's live error.
