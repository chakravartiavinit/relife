// Runs in <head> before paint (same pattern as THEME_SCRIPT), so the sidebar's saved state is on <html> before the
// first frame and CSS (`html[data-sidebar="rail"]`, `html[data-life="closed"]`) lays it out with no flash.
// Plain module, not 'use client': the server layout reads these strings.

export const SIDEBAR_KEY = 'relife:sidebar'
export const LIFE_KEY = 'relife:sidebar-life'

export const SIDEBAR_SCRIPT = `(function(){try{var d=document.documentElement;d.dataset.sidebar=localStorage.getItem('${SIDEBAR_KEY}')==='rail'?'rail':'expanded';d.dataset.life=localStorage.getItem('${LIFE_KEY}')==='closed'?'closed':'open'}catch(e){}})()`
