// Synthetic training phases at OSM-tagged signal nodes. No live RTA timing is
// implied. The same function is used by traffic, the player coach, and renderer.
export function signalPhase(time,heading){const phase=time%32,axis=Math.abs(Math.sin(heading))>.7?1:0,local=(phase+axis*16)%32;return local<12?'green':local<15?'amber':'red'}
