import {
  Airplane,
  Bank,
  Boat,
  Buildings,
  Certificate,
  Crosshair,
  Drop,
  Factory,
  Flag,
  Gavel,
  GlobeHemisphereEast,
  Handshake,
  Lightning,
  MapPin,
  Megaphone,
  Money,
  Newspaper,
  Package,
  Scales,
  ShieldCheck,
  Student,
  Truck,
  UserCircle,
  Users,
  Warning,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import type { IconName } from "@crammer/schema";

/**
 * A curated icon set. Keeping it explicit means the render bundle only carries the
 * icons we actually use. `ICON_NAMES` in `@crammer/schema` is the source of truth for
 * which names exist; the type below fails the build if the two drift apart.
 */
export const ICONS: Record<IconName, PhosphorIcon> = {
  Airplane,
  Bank,
  Boat,
  Buildings,
  Certificate,
  Crosshair,
  Drop,
  Factory,
  Flag,
  Gavel,
  GlobeHemisphereEast,
  Handshake,
  Lightning,
  MapPin,
  Megaphone,
  Money,
  Newspaper,
  Package,
  Scales,
  ShieldCheck,
  Student,
  Truck,
  UserCircle,
  Users,
  Warning,
};

export const Icon: React.FC<{ name: IconName; size: number; color: string }> = ({
  name,
  size,
  color,
}) => {
  const Component = ICONS[name] ?? UserCircle;
  return <Component size={size} color={color} weight="regular" />;
};
