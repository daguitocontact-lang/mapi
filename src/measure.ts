type FontMetrics = { first: number; widths: number[]; fallback: number }

// Advance widths in 1/1000 em for U+0020–U+00FF, extracted from Inter Medium (the heaviest
// weight a label uses). Measuring with the font the renderer draws in is what guarantees a
// label never spills out of its box.
const INTER: FontMetrics = {
  first: 32,
  fallback: 580,
  widths: [
  267, 304, 494, 639, 646, 993, 653, 313, 369, 369, 521, 667, 303, 462, 303, 370,
  646, 415, 616, 627, 656, 603, 630, 571, 629, 630, 303, 315, 667, 667, 667, 527,
  982, 709, 657, 733, 722, 603, 589, 748, 745, 272, 575, 688, 565, 913, 756, 767,
  642, 769, 648, 646, 653, 740, 709, 1003, 701, 696, 641, 369, 370, 369, 477, 463,
  337, 568, 618, 577, 618, 587, 379, 620, 602, 252, 252, 559, 252, 888, 602, 604,
  618, 618, 387, 539, 340, 602, 575, 829, 557, 575, 559, 440, 346, 440, 667, 580,
  580, 580, 580, 580, 580, 580, 580, 580, 580, 580, 580, 580, 580, 580, 580, 580,
  580, 580, 580, 580, 580, 580, 580, 580, 580, 580, 580, 580, 580, 580, 580, 580,
  267, 304, 577, 620, 737, 557, 293, 568, 602, 914, 457, 608, 667, 580, 665, 465,
  457, 667, 448, 455, 337, 600, 601, 303, 300, 314, 485, 608, 817, 858, 895, 527,
  709, 709, 709, 709, 709, 709, 1003, 733, 603, 603, 603, 603, 272, 272, 272, 272,
  743, 756, 767, 767, 767, 767, 767, 667, 767, 740, 740, 740, 740, 696, 647, 630,
  568, 568, 568, 568, 568, 568, 915, 577, 587, 587, 587, 587, 252, 252, 252, 252,
  588, 602, 604, 604, 604, 604, 604, 667, 604, 602, 602, 602, 602, 575, 618, 575,
  ],
}

function widthIn(m: FontMetrics, text: string): number {
  let units = 0
  for (const ch of text) units += m.widths[ch.codePointAt(0)! - m.first] ?? m.fallback
  return units
}

// Small margin for hinting / sub-pixel differences between renderers.
const SAFETY = 1.03

export function textWidth(text: string, fontSize: number): number {
  return (widthIn(INTER, text) / 1000) * fontSize * SAFETY
}
