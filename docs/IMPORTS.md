# Importing a file

You > Connections > **Import a file** brings in history that a connector can't fetch: a bank or card statement, a tracker
CSV, an Apple Health export or a Google Takeout. Setup's Connect step and Today's "Bring your history" step open the same
dialog. Everything is read on your own machine; nothing is uploaded anywhere.

An import never overwrites what ReLife already has. Every row it adds is tagged with the import, so **Past imports >
Undo** removes exactly that import and nothing else. Running the same file twice adds nothing the second time.

## Size limits

- CSV files: up to 25 MB.
- ZIP files (Apple Health, Google Takeout): up to 2 GB by default. Set `RELIFE_IMPORT_MAX_MB` in `.env` to change it, then
  restart.
- The file is sent in 8 MB pieces and the upload resumes if the connection drops. ReLife needs about 10% more free disk
  space than the file size while it works.
- Behind a reverse proxy, allow request bodies of at least 9 MB. For nginx that is `client_max_body_size 16m;`.

## Bank or card statement (CSV)

1. Download the statement as CSV from your bank's website or app. Use the whole month or year, not a single transaction.
2. In the dialog, pick **Bank or card statement**, choose the file, and check the columns ReLife guessed (date, description,
   amount, separate debit and credit columns, or an unsigned amount with a **Dr / Cr** column). The preview shows the first
   rows; change a column if one is wrong. If the dates could be read two ways (01/02/2024), you pick the order before the
   import can start. A file that matches an earlier import (same columns, same dates) shows a warning; rows already there
   are skipped.
3. Tick **Purchases are positive numbers in this file** when the preview shows your spending as a plus. Card statements often do. Pick Bank or Card for the account.
4. Import. ReLife remembers the column choice for the next file from the same bank.

Tips:
- Dates in `13/11/2025` and `11/13/2025` style are told apart from the whole column. If a column could be either, the
  dialog shows which one it picked and lets you change it.
- A row that matches an app order (same amount and currency, both money out, within 2 days) is stored but **not counted
  twice**: the order keeps its items and category, and the bank row says "Same payment as Swiggy". Open the payment and
  choose **Not the same payment** if a pair is wrong; ReLife will not link that pair again.
- Credit card bill payments and transfers between your own accounts are filed under Transfers so they don't count as
  spending on top of the card's own rows.
- Bank SMS and emails are never read. Imported rows don't trigger "new payment" alerts.

## Tracker CSV

A CSV with one row per day (or per entry) and one column per thing you track: weight, mood, pages read. Pick **Tracker
CSV**, say which column is the date and which columns become trackers (name and unit). Existing days that already have a
value from another source are left alone.

## Apple Health (iPhone)

1. Open the **Health** app, tap your picture at the top right, then **Export All Health Data**.
2. Wait for the export (a large history takes a few minutes), then save `export.zip` to Files and move it to your computer.
3. Pick **Apple Health** in the dialog and choose the ZIP.

ReLife reads steps, walking and running distance, flights climbed, active energy, weight, resting heart rate, mindful
minutes and sleep, as one total per day. The XML inside is read as a stream, so a multi-gigabyte export doesn't need that
much memory. Days where your live data (iPhone Shortcuts, a connected device) already has a value keep it.

## Google Takeout

1. Open [takeout.google.com](https://takeout.google.com), choose **Deselect all**, then tick only what you want:
   - **Fit** for daily steps, distance, move minutes and heart points.
   - **YouTube and YouTube Music**, then under "All YouTube data included" tick only **history**, and choose **JSON** as the
     format of history.
2. Create the export and download the ZIP.
3. Pick **Google Takeout** in the dialog and choose the ZIP.

Everything else in a Takeout is skipped on purpose: Location History is too big and too private, Chrome overlaps the
Chrome extension, and Calendar has its own connector. Fit and YouTube files with English headers are read; other
languages aren't yet.

## Past imports

The last ten imports are listed under the button: kind, file, date, what was added, linked and skipped, and **Undo**.
Undo asks once, then removes the rows of that import, unlinks any bank rows it matched, and refreshes your totals. If a
later import repeated some of those rows, they go too (a row belongs to the first import that added it). A failed import,
or one that stopped while running, shows **Remove**, which also takes out any rows it had already written.
Uploads that were never started are cleaned up after a day.

Matched bank rows are listed on Spending ("N bank rows matched app orders"); open one to see it and choose "Not the same
payment". A spend typed in Capture only matches a bank row whose description holds its name.
