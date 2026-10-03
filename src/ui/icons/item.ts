const paths:Record<string,string>={
 wood:'M5 17 16 6l5 5L10 22 5 17Zm1-5 7-7m4 3 2 2M7 16l3 3',
 stone:'m4 17 2-9 7-4 7 7-2 9H8L4 17Zm2-9 6 5 8-2m-8 2-4 7',
 sword:'m6 21 4-4M4 14l6 6M8 16 18 4l3-1-1 4L10 18',
 axe:'M8 22 16 3m-6 6 6-4 6 4-3 6-7-3',
 shield:'m5 5 7-3 7 3v8c0 5-7 9-7 9s-7-4-7-9V5Zm7-3v20',
 berry:'M12 10c-6-6-12 7-3 11 2 1 4 1 6 0 9-4 3-17-3-11Zm0 0V3m0 4 6-4M8 14h.1',
 bench:'M3 10h18V7H3v3Zm3 0v11m12-11v11M6 16h12',
 fire:'M12 2c2 7 9 8 7 14-3 9-17 5-14-3l4-5c-1 5 2 6 3 3V2Zm-7 20 14-2',
 wall:'M3 3h18v18H3V3Zm6 0v18m6-18v18M3 7h18M3 17h18',
 roof:'m2 13 10-9 10 9M5 11v10h14V11M9 21v-7h6v7',
 staff:'m6 22 9-15m-3-4 5-2 5 4-2 5-6-1-2-6Z',
 bow:'M6 3c16 1 16 17 0 18L14 12 6 3Zm-3 9h18m-3-3 3 3-3 3',
 map:'m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16',
 water:'M12 2C9 8 4 11 4 16a8 8 0 0 0 16 0c0-5-5-8-8-14ZM8 16c0 3 2 4 4 4',
 hammer:'m5 21 9-12m-5-4 5-4 8 7-5 5-8-8Z',
 bag:'M7 8V6a5 5 0 0 1 10 0v2M4 8h16v14H4V8Zm4 6h8',
};
export function itemIcon(id:string):string {
 const key=id.endsWith('Sword')||id==='greatsword'?'sword':id==='stew'?'berry':id==='foundation'?'stone':id==='floor'||id==='pillar'?'wall':id==='bed'?'roof':id==='chest'?'bag':id==='book'?'staff':id==='resin'?'water':id;
 return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[key]??'m12 2 9 10-9 10-9-10L12 2Zm0 0v20M3 12h18'}"/></svg>`;
}
