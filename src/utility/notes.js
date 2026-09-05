// Parsing and proximity clustering helpers for locally saved utility notes.
export function parseGetpos(value) {
  const text = String(value || '').replace(/[,\n]+/g, ' ');
  const setpos = text.match(/setpos(?:_exact)?\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/i);
  const setang = text.match(/setang(?:_exact)?\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/i);
  if (setpos && setang) return { position: setpos.slice(1, 4).map(Number), angles: setang.slice(1, 4).map(Number) };
  const values = text.match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
  return values.length >= 6 ? { position: values.slice(0, 3), angles: values.slice(3, 6) } : null;
}

const utilityPositionKey = (position) => position.map((value) => Math.round(value * 10) / 10).join(':');

export function utilityPositionClusters(notes) {
  const clusters = [];
  notes.forEach((note) => {
    const [x, y, z] = note.position || [];
    const cluster = clusters.find((item) => {
      const [anchorX, anchorY, anchorZ] = item.anchor;
      const samePlace = !note.startPlace || !item.place || note.startPlace === item.place;
      return samePlace && Math.hypot(x - anchorX, y - anchorY) <= 16 && Math.abs(z - anchorZ) <= 8;
    });
    if (cluster) cluster.entries.push(note);
    else clusters.push({ key: utilityPositionKey(note.position), anchor: note.position, place: note.startPlace || '', entries: [note] });
  });
  return clusters;
}
