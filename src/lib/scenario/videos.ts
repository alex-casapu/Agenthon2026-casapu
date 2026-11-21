/**
 * Background videos of the presentation. A slide names a key; the file lives in public/slides/v/<key>.mp4.
 * While a file is missing the stage shows a labelled placeholder, so the deck is presentable before any
 * footage exists. `brief` is what the clip should show (used as the generation prompt, if it is ever generated).
 */
export interface VideoSlot {
  key: string;
  /** Where it is used. */
  use: string;
  /** What the footage should show. */
  brief: string;
  /** Present in public/slides/v today. */
  ready: boolean;
}

export const VIDEOS: VideoSlot[] = [
  { key: "wheat", use: "Opening", brief: "Golden durum wheat field at sunrise, ears swaying, warm low sun, slow forward dolly. No people, no text.", ready: true },
  { key: "mill", use: "Parma, 08:58", brief: "Inside a flour mill: golden semolina pouring from a chute into a steel hopper, dust in beams of window light, slow motion.", ready: true },
  { key: "racks", use: "Under the hood", brief: "Modern clean pasta factory: strands of spaghetti on drying racks gliding past, soft industrial light.", ready: true },
  { key: "harvest", use: "The stakes", brief: "Aerial dusk shot of a combine harvester cutting a vast wheat field, dust in sunset light.", ready: true },
  { key: "pasta", use: "Finale", brief: "Macro: fresh spaghetti lifted with a fork from steaming water, warm kitchen light.", ready: true },
];

export const videoSlot = (key?: string) => VIDEOS.find((v) => v.key === key);
