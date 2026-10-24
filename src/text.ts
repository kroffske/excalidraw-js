import { Scene } from "./core.js";
import { Bounds, ElementLike, PlacedBlock, boundsFor } from "./geometry.js";
import { fitText, FitTextOptions, FittedText } from "./text-fit.js";
export * from "./text-fit.js";

export interface TextBoxOptions extends FitTextOptions {
  color?: string;
  align?: string;
  valign?: string;
}

export interface PlacedTextBox {
  element: ElementLike;
  block: PlacedBlock;
  bounds: Bounds;
  fitted: FittedText;
  overflowed: boolean;
  warnings: string[];
}

export function textBox(scene: Scene, x: number, y: number, content: string, options: TextBoxOptions): PlacedTextBox {
  const fitted = fitText(content, options);
  const element = scene.text(x, y, fitted.text, {
    size: fitted.size,
    color: options.color,
    width: options.width,
    align: options.align,
    valign: options.valign,
    family: options.family,
    lineHeight: fitted.lineHeight,
  });
  const block = new PlacedBlock([element], boundsFor([element]));
  return { element, block, bounds: block.bounds, fitted, overflowed: fitted.overflowed, warnings: fitted.warnings };
}

export const text_box = textBox;
