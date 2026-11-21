import type { RenderStyle } from './render/theme'

type FontMetrics = { first: number; widths: number[]; fallback: number }

// Advance widths in 1/1000 em for U+0020–U+00FF, extracted from the real fonts
// (Excalifont for sketch, Inter Medium for clean — the heaviest weight a label uses). Measuring with the font the renderer
// draws in is what guarantees a label never spills out of its box.
const METRICS: Record<RenderStyle, FontMetrics> = {
  sketch: {
    first: 32,
    fallback: 581,
    widths: [
    400, 314, 371, 783, 721, 928, 718, 218, 441, 402, 525, 550, 257, 411, 274, 561,
    664, 427, 700, 608, 585, 618, 640, 558, 636, 629, 264, 298, 550, 550, 550, 466,
    829, 676, 761, 629, 780, 707, 661, 780, 573, 545, 569, 613, 543, 766, 632, 767,
    698, 768, 736, 622, 857, 730, 592, 786, 628, 564, 832, 472, 589, 497, 510, 670,
    600, 576, 555, 504, 605, 537, 497, 555, 567, 244, 328, 533, 225, 663, 526, 600,
    537, 539, 412, 543, 553, 548, 525, 693, 591, 530, 572, 504, 299, 544, 669, 581,
    581, 581, 581, 581, 581, 581, 581, 581, 581, 581, 581, 581, 581, 581, 581, 581,
    581, 581, 581, 581, 581, 581, 581, 581, 581, 581, 581, 581, 581, 581, 581, 581,
    400, 290, 489, 710, 581, 656, 299, 581, 600, 858, 422, 649, 581, 692, 650, 600,
    412, 550, 581, 581, 600, 581, 643, 200, 600, 581, 422, 668, 762, 762, 868, 455,
    676, 676, 676, 676, 676, 676, 1028, 629, 707, 707, 707, 707, 545, 545, 545, 545,
    815, 632, 767, 767, 767, 767, 767, 550, 772, 730, 730, 730, 730, 564, 678, 573,
    542, 542, 542, 542, 542, 542, 909, 504, 551, 551, 551, 551, 244, 244, 244, 244,
    514, 526, 561, 561, 561, 561, 561, 550, 617, 508, 508, 508, 508, 522, 568, 522,
    ],
  },
  clean: {
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
  },
}

function widthIn(m: FontMetrics, text: string): number {
  let units = 0
  for (const ch of text) units += m.widths[ch.codePointAt(0)! - m.first] ?? m.fallback
  return units
}

// Small margin for hinting / sub-pixel differences between renderers.
const SAFETY = 1.03

/**
 * Width of `text` in the WIDEST of the two styles' fonts. Layout must not depend on
 * the style — switching sketch ↔ clean is a reskin, so boxes keep their size and
 * every shape stays exactly where it was. `_style` is kept for call-site clarity.
 */
export function textWidth(text: string, fontSize: number, _style: RenderStyle): number {
  const units = Math.max(widthIn(METRICS.sketch, text), widthIn(METRICS.clean, text))
  return (units / 1000) * fontSize * SAFETY
}
