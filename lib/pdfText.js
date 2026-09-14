// TEXT THAT pdf-lib CAN ACTUALLY DRAW.
//
// pdf-lib's standard fonts use WinAnsi encoding. Hand it a character outside
// that range - an emoji, a smart quote pasted out of Word, a curly apostrophe
// from a phone keyboard - and drawText THROWS. The whole PDF fails, which means
// the download fails, or the email that was going to carry it never sends.
//
// WHY THIS FILE EXISTS
// --------------------
// Five builders need this rule. Three had written their own; two had none:
//
//   lib/applicationPdf.js    had one, and explicitly kept £
//   lib/handoverPdf.js       had one, and STRIPPED £  (\x20-\x7E)
//   lib/weeklyLabourPdf.js   had one, kept everything to \xFF, plus a rule for
//                            the water-ingress droplet
//   lib/preStartPdf.js       NONE - a curly quote in a Pre-Start field made the
//                            send fail
//   lib/variationPdf.js      NONE
//
// So the same rule existed three times, disagreed with itself about the pound
// sign, and was missing from the two that most often carry text somebody has
// pasted in. That is the fault class this project keeps producing, and the
// answer is one copy rather than a sixth.
//
// THE POUND SIGN IS THE POINT. It is \xA3 - outside ASCII, inside WinAnsi. A
// sanitiser written as "printable ASCII only" removes it, and a PDF full of
// "1,234.56" where it should say "£1,234.56" is a document you send to a
// customer. applicationPdf's author hit this and allowed it back explicitly;
// handoverPdf's did not. Hence the test at the bottom of this comment being the
// first thing anyone changing this file should run.

// Common typographic characters mapped to something WinAnsi can draw, rather
// than dropped. A dash that vanishes changes the meaning of a sentence; a dash
// that becomes a hyphen does not.
const MAP = [
  // Apostrophes come in more shapes than the obvious two. U+02BC in particular
  // is what some keyboards produce, and my first version missed it - so
  // "James' site" came out as "James site", the apostrophe silently deleted
  // rather than replaced. A dropped apostrophe is worse than a wrong one:
  // nobody reads it as an encoding problem, they read it as a typo we made.
  [/[\u2018\u2019\u201A\u201B\u02B9\u02BC\u02C8\u2032]/g, "'"],
  [/[\u201C\u201D\u201E\u201F\u2033]/g, '"'],
  [/[\u2013\u2014\u2015]/g, '-'],             // en, em, horizontal bar
  [/\u2026/g, '...'],                          // ellipsis
  [/[\u2022\u25CF\u25AA\u25E6]/g, '-'],        // bullets
  [/\u00A0/g, ' '],                            // non-breaking space
  [/[\u2190-\u21FF]/g, '->'],                  // arrows
  [/\u2713|\u2714/g, 'Y'],                     // ticks
  [/\u2717|\u2718/g, 'N'],                     // crosses
  [/\u{1F4A7}\s*/gu, 'WI: '],                  // water-ingress droplet
]

// Everything Latin-1 is kept, which is what WinAnsi can encode and what keeps
// the pound sign, accented names, and the degree symbol. Anything above it -
// emoji, CJK, symbols - is removed rather than left to throw.
export function pdfText(s) {
  if (s == null) return ''
  let out = String(s)
  for (const [re, to] of MAP) out = out.replace(re, to)
  return out.replace(/[^\x00-\xFF]/g, '')
}

// Same, trimmed - the common case for a field going into a table cell.
export function pdfCell(s) {
  return pdfText(s).trim()
}
