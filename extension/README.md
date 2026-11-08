# ReLife browser extension

Measures focused time on each site (and YouTube video, and course page) and sends it to **your own** ReLife
on this computer. Nothing goes anywhere else.

## Install (Chrome, Arc, Brave, Edge)

1. In ReLife, open **Connectors → Laptop activity**, put any long random text in **Extension token**
   (e.g. from `openssl rand -hex 24`) and press Connect.
2. Open `chrome://extensions`, turn on **Developer mode**, press **Load unpacked** and choose this `extension` folder.
3. Click the ReLife icon in the toolbar, open **Connection**, paste the same token and press **Save and test**.

## What it records

- The site, page path (no query string) and page title of the tab in front, while you're active or a video
  is playing. Idle for 2 minutes, another app in front, or a locked screen stops the clock.
- On YouTube, the channel name too, so lessons count as learning and the rest as entertainment.
- On anything you chose with **Track this…** (a course, show or anime, video series, book): the lesson or
  episode and "x of y" progress when the page shows it. Shows and YouTube playlists are matched by series,
  so every episode counts toward the same item. Its cover picture (or the site's icon) is copied once into
  ReLife's `data/library`.

## Choosing what a site counts as

The popup shows the site you're on (with its time today and what it counts as: tap a chip to change it), the course or show it belongs to, and today's time by kind. The gear opens the connection settings.
ReLife re-sorts that site's past time too. The same picker is on ReLife's Activity page, next to each site.

Never recorded: incognito windows, sites you exclude from the popup, page contents, keystrokes, form fields.
Click the **Tracking** pill at the top of the popup to pause everything until you resume; the eye button next to a site stops tracking that site.

## How it sends

Every 30 seconds it posts the current stretch and any finished ones to `POST /api/activity` with your token.
If ReLife isn't running, it keeps up to 2,000 stretches and sends them later.
