# Keyboard and controls

The screen is sorted by kind of control:

| Where | What |
| --- | --- |
| Top centre | The LIVE banner and the **Hall / System** switch |
| Top right | Icon toggles: sound, camera tour, picture mode, settings |
| Bottom left | A **map of the hall**: click a dot to fly there |
| Right edge | Panel tabs: Project info, Crew, Activity, Library |
| Left | The project rail |
| Bottom right | `?` opens the keyboard sheet (the Quality chip shows only when you forced a level) |

The hint "Drag to turn, wheel to zoom, right-drag to move" shows for a few seconds and then fades.

## Mouse
- **Drag** to turn, **wheel** to zoom, **right-drag** to move the point you orbit.
- **Click a bay** to fly in and open its panel. **Click a robot** to open its details. **Click a planet** in the solar system to fly down into that project.

## Keys
| Key | What it does |
| --- | --- |
| `1` `2` `3` `4` `5` | Core, design studio, launch pad, library, cart |
| `R` | Reset the view (in the solar system: the overview) |
| `G` | Hall to solar system, and back down into the current project |
| `M` | Sound on or off |
| `T` | Camera tour on or off |
| `,` | Settings |
| `I` `C` `A` `L` | Project info, Crew, Activity, Library (press again to close) |
| `H` | Picture mode |
| `[` | Fold the project rail |
| `?` | The keyboard sheet |
| `Esc` | Close the open panel or sheet, or leave picture mode |

Keys are ignored while you type in a field. The table lives in `src/keymap.ts`; the sheet and the handler both read it.

## The idle tour
After 30 seconds with nothing touched (15, 30 or 60, or off, in Settings) the camera glides to the bays, the launch pad, the library, the studio, the core, the cart and the sky. Any mouse move, click, wheel, key or touch stops it.
