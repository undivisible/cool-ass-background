# Source and third-party notices

The five-color domain-warped noise field is extracted from Max Carter's
`undivisible/undivisible.dev`, `web/src/lib/visuals/ascii-shader.ts`, revision
f72ba151b89bb76799563fc05772c1fac9e38b7f. The glyph ramp and moving inverted
geometric forms are adapted from that site's `Ascii.tsx`. The source owner
authorized this separate ISC release. This is the decorative field, not the
site's semantic text compositor, weather canvas or page-reveal sequence.

`undivisible/drift-wallpaper` revision d1be28de520b241049200e51533a3dd9de0dcc6b
was inspected before implementation. It uses winit desktop-level windows on
macOS, bottom/nonactivating windows on Windows, and macOS Spotify/Music queries
with palette transitions. This project uses the same native hosting concepts,
but contains no copied Drift source or Rust dependencies. Drift remains
MPL-2.0; its license is not replaced by this project's ISC license.

Windows builds use Microsoft.Web.WebView2 (Microsoft's BSD-style WebView2 SDK
license, distributed with the package). The WebView2 Runtime is a separately
installed Microsoft product under its own terms. .NET runtime notices ship
with self-contained Windows distributions. Android builds use the Apache-2.0
Android Gradle plugin and Android platform APIs. Build dependencies are not
bundled into the reusable website module. System fonts are used, not bundled.

Last.fm, Spotify, Apple Music, and artwork belong to their respective owners.
No album artwork, credentials, proprietary fonts, or music are bundled.
