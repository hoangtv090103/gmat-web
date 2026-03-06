"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { cn } from "@/lib/utils";

export function FaIcon({
  icon,
  className,
  title,
  spin = false,
}: {
  icon: IconDefinition;
  className?: string;
  title?: string;
  spin?: boolean;
}) {
  return (
    <FontAwesomeIcon
      icon={icon}
      className={cn("inline-block", className)}
      title={title}
      spin={spin}
    />
  );
}

