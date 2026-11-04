// FASTrack-specific behaviour added to Mapshaper's GUI.
// Keep FASTRACK_CYCLEWAYS and FASTRACK_PATH_HIGHWAYS in sync with
// src/cycleways.ts in the FASTrack shell.

// Cycleway types offered when editing, best to worst for cycling safety.
// `value` is the code the model expects; the label and hint are what
// planners see.
export var FASTRACK_CYCLEWAYS = [
  {value: 'bikepath', label: 'Off-road bike path', hint: 'Path for bikes only, away from traffic', color: '#008300'},
  {value: 'shared_path', label: 'Shared path', hint: 'Off-road path shared with people walking', color: '#1baf7a'},
  {value: 'separated_lane', label: 'Protected bike lane', hint: 'On-road, with a kerb, bollards or other barrier', color: '#2a78d6'},
  {value: 'simple_lane', label: 'Painted bike lane', hint: 'On-road, painted line only', color: '#eda100'},
  {value: 'inadequate_lane', label: 'Substandard painted lane', hint: 'Under 1.2 m (1.8 m next to parking), or parking allowed in it', color: '#eb6834'},
  {value: 'shared_street', label: 'Shared street', hint: 'Bikes share the road with traffic, marked with bike symbols', color: '#e34948'},
  {value: '', label: 'No cycling infrastructure', hint: 'Bikes ride in general traffic', color: '#bdbdbd'}
];

// Bus and train links are part of the model network but can't be edited,
// so the Maker hides them (they still go up with the scenario). The shell's
// Options menu can show them again as faint dotted lines.
var fastrackShowTransit = false;

export function isTransitLink(rec) {
  return !!rec && (rec.highway == 'bus' || rec.highway == 'train');
}

// Footpaths and other paths are drawn dashed so they stand out from roads.
export var FASTRACK_PATH_HIGHWAYS = ['footway', 'path', 'cycleway', 'proposed_cycleway', 'pedestrian', 'track', 'steps', 'corridor', 'bridleway'];

export function isPathLink(rec) {
  return !!rec && FASTRACK_PATH_HIGHWAYS.indexOf(rec.highway) > -1;
}

export function findCycleway(value) {
  return FASTRACK_CYCLEWAYS.find(function(c) { return c.value === (value || ''); });
}

export function getCyclewayLabel(value) {
  var c = findCycleway(value);
  return c ? c.label : String(value);
}

export function getCyclewayColor(value) {
  var c = findCycleway(value);
  return c ? c.color : null;
}

export function setFastrackTransitVisible(visible) {
  fastrackShowTransit = !!visible;
}

export function isFastrackTransitVisible() {
  return fastrackShowTransit;
}
