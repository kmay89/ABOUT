/**
 * Every printable extra, grouped by the shape it suits, for the picker in
 * "Frame it, light it". Each `make` takes the picture's settings plus the
 * options shown for it, and returns { parts, notes, ghosts? }.
 */
import { deskStand, lampBase, shadeStand } from './accessories.js';
import { galleryFrame, lantern } from './frames.js';

export const ACCESSORIES = Object.freeze({
  flat: [
    { id: 'gallery', name: 'Gallery frame', blurb: 'An even border, a bevelled window, and a slot for the light — slide it in, press the lid on',
      make: o => galleryFrame(o), options: ['light', 'gap', 'style', 'margin', 'fit', 'cover'] },
    { id: 'showcase', name: 'Showcase frame', blurb: 'The gallery frame with slots behind the light for 1–6 more pictures — swap them with the seasons',
      make: o => galleryFrame({ ...o, storage: o.storage ?? 4 }), options: ['light', 'gap', 'storage', 'style', 'margin', 'fit', 'cover'] },
    { id: 'lantern', name: 'Lantern', blurb: 'Four pictures round a light, held by corner posts — fill the other sides with patterns or more photos',
      make: o => lantern(o), options: ['fit'] },
    { id: 'stand', name: 'Desk stand', blurb: 'A slotted foot, to stand it in front of a light', make: deskStand, options: [] },
  ],
  cylinder: [{ id: 'base', name: 'Tea-light base', blurb: 'A cup it stands in, hiding an LED tea light', make: lampBase, options: [] }],
  curved: [{ id: 'stand', name: 'Nightlight stand', blurb: 'A round base that holds the shade and a light', make: shadeStand, options: [] }],
});
