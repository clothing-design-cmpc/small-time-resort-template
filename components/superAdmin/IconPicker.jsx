/**
 * FILE: components/superAdmin/IconPicker.jsx
 * ROLE: Super-admin — shared UI, protected by middleware.js auth guard
 *
 * PURPOSE:
 * Dropdown select for choosing a Lucide icon by name, with a live
 * thumbnail preview next to the trigger (blueprint Page 2 — Amenities
 * Management: "Icon selector: Shows thumbnails of Lucide icons with
 * names"). Reusable anywhere an admin field stores a Lucide icon name
 * string (amenities today, could extend to categories/badges later).
 *
 * DATA FLOW:
 * 1. Consumer passes the currently selected icon name + an onChange
 *    callback — this component holds no state of its own
 * 2. ICON_OPTIONS maps a curated set of resort-relevant icon names to
 *    their Lucide component, so every option always has a rendered
 *    thumbnail next to its label
 */
import { useMemo } from "react";
import {
  Wifi,
  Waves,
  Dumbbell,
  Utensils,
  Car,
  Wind,
  Snowflake,
  Tv,
  Coffee,
  ShowerHead,
  BedDouble,
  Sparkles,
  Sun,
  Trees,
  Dog,
  ShieldCheck,
  Baby,
  Martini,
  Flower2,
  ParkingCircle,
} from "lucide-react";
import "./IconPicker.css";

/* Curated for a resort/villa context — every entry here must have a
   matching Lucide import above so the preview never renders blank. */
export const ICON_OPTIONS = [
  { name: "wifi", label: "Wifi", Icon: Wifi },
  { name: "waves", label: "Pool / Beach", Icon: Waves },
  { name: "dumbbell", label: "Gym", Icon: Dumbbell },
  { name: "utensils", label: "Restaurant", Icon: Utensils },
  { name: "car", label: "Parking (Valet)", Icon: Car },
  { name: "parking-circle", label: "Parking (Self)", Icon: ParkingCircle },
  { name: "wind", label: "Air Conditioning", Icon: Wind },
  { name: "snowflake", label: "Cooling", Icon: Snowflake },
  { name: "tv", label: "TV / Entertainment", Icon: Tv },
  { name: "coffee", label: "Coffee / Cafe", Icon: Coffee },
  { name: "shower-head", label: "Bathroom", Icon: ShowerHead },
  { name: "bed-double", label: "Rooms", Icon: BedDouble },
  { name: "sparkles", label: "Spa", Icon: Sparkles },
  { name: "sun", label: "Sun Deck", Icon: Sun },
  { name: "trees", label: "Garden", Icon: Trees },
  { name: "dog", label: "Pet Friendly", Icon: Dog },
  { name: "shield-check", label: "Security", Icon: ShieldCheck },
  { name: "baby", label: "Kids Friendly", Icon: Baby },
  { name: "martini", label: "Bar", Icon: Martini },
  { name: "flower-2", label: "Wellness", Icon: Flower2 },
];

/**
 * getIconByName
 * Looks up the Lucide component for a stored icon name. Falls back to
 * Sparkles so an unrecognized/legacy name never renders a blank icon.
 */
export function getIconByName(name) {
  return ICON_OPTIONS.find((option) => option.name === name)?.Icon ?? Sparkles;
}

export default function IconPicker({ id, value, onChange }) {
  // Memoized so the compiler sees a stable component reference rather
  // than treating the lookup as creating a new component every render.
  const SelectedIcon = useMemo(() => getIconByName(value), [value]);

  return (
    <div className="iconPicker">
      <span className="iconPickerPreview" aria-hidden="true">
        {/* eslint-disable-next-line react-hooks/static-components -- SelectedIcon is a memoized reference to one of the imported Lucide icons above, not a component created fresh each render */}
        <SelectedIcon size={20} strokeWidth={1.75} />
      </span>
      <select
        id={id}
        className="iconPickerSelect"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {ICON_OPTIONS.map((option) => (
          <option key={option.name} value={option.name}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
