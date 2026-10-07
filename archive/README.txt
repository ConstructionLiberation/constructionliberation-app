ARCHIVED, NOT DELETED.

These pages were removed from the app and kept here in case SRATs are ever
brought back.

  srat.portal.js      was pages/operations/project-management/srat.js
  srats.redirect.js   was pages/operations/srats.js
  srats.siteapp.js    was pages/forms/cm/srats.js

Nothing in /archive is routed - Next.js only routes files under /pages, so
these are inert where they sit.

KEPT LIVE ON PURPOSE:
  pages/api/srats.js   the data and its API. Every SRAT ever written is still
                       in ops:srats and still readable. Removing the route
                       would have made the stored data unreachable, which is
                       not what "archive" means.

To bring it back: move the files to their original paths, restore the nav
entry in components/OperationsNav.js and the tile in pages/forms/index.js.
