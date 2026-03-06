"use client"

import {
  faCircleCheck,
  faCircleInfo,
  faCircleXmark,
  faSpinner,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { FaIcon } from "@/components/ui/fa-icon"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <FaIcon icon={faCircleCheck} className="size-4" />,
        info: <FaIcon icon={faCircleInfo} className="size-4" />,
        warning: <FaIcon icon={faTriangleExclamation} className="size-4" />,
        error: <FaIcon icon={faCircleXmark} className="size-4" />,
        loading: <FaIcon icon={faSpinner} className="size-4" spin />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
