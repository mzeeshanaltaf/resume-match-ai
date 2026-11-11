import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-semibold whitespace-nowrap transition-colors duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/30 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive",
        outline:
          "border border-input bg-card hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-accent",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline underline-offset-4 decoration-1 hover:decoration-2",
      },
      // Touch-sized below md (44px), compact from md up.
      size: {
        default: "h-11 px-4 py-2 has-[>svg]:px-3 md:h-9",
        xs: "h-7 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 md:h-6 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-10 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5 md:h-8",
        lg: "h-12 rounded-md px-6 text-base has-[>svg]:px-4 md:h-11",
        icon: "size-11 md:size-9",
        "icon-xs": "size-7 rounded-md md:size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-10 md:size-8",
        "icon-lg": "size-12 md:size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
