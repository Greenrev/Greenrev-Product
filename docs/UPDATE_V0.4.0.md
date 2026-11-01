# Update v0.4.0 to v0.4.1

This fixes the local Session change refused error and restores the charcoal/black, white and lime colours used before the modular TypeScript release.

## Windows

1. In the terminal running the old demo, press Ctrl+C.
2. Extract the v0.4.1 ZIP.
3. Open its GreenRev-SaaS-TypeScript-v0.4.1 folder. Copy its contents into your existing project folder (the one containing package.json). Choose Replace for updated files. Do not delete the existing project folder or saved database. The ZIP contains no database and does not reset it.
4. Run start-demo-windows.bat again.
5. Open http://127.0.0.1:3100 or http://localhost:3100 and press Ctrl+F5.
6. Use Review as to switch to Dealer, Parts, Rentals or Haulage.

Copying into the existing folder retains the database at its existing path. Opening a separately extracted folder starts a separate demonstration database.

A developer using an unchanged v0.4.0 source tree can instead check/apply UPGRADE_FROM_V0.4.0.patch and run npm ci. The full v0.3 upgrade patch is also retained. No production database, sign-in or payment configuration is changed by this hotfix.

If you previously configured GREENREV_DEMO_ORIGIN yourself, leave it unset to use either local address, or open the exact address you configured.

## Cause

Next can expose an internal request URL using localhost while the browser sends a 127.0.0.1 Origin. Previously the local demo compared those addresses directly and rejected a legitimate profile change. The fix derives the expected origin from a validated local Host header and still checks the browser's Origin and CSRF token. The production host adapter retains its explicitly configured origin.

The first browser session request is now shared across React development effect replay to prevent concurrent cookie/token creation.
