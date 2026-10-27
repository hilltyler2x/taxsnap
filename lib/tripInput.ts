// Shared validation for creating and editing trips. A trip's miles come from one of:
// odometer readings, a plain miles number typed in, or GPS (Start/End trip or automatic).
import { z } from "zod"
import { calcMileageDeductible } from "@/lib/irs"

export const TripInputSchema = z.object({
  purpose: z.string(),
  destination: z.string(),
  date: z.string(),
  miles: z.number().positive().max(2000).nullable().optional(),
  odoStart: z.number().int().nonnegative().nullable().optional(),
  odoEnd: z.number().int().positive().nullable().optional(),
  source: z.enum(["odometer", "manual", "gps", "auto"]).nullable().optional(),
  startPlace: z.string().nullable().optional(),
  startLat: z.number().nullable().optional(),
  startLng: z.number().nullable().optional(),
  endLat: z.number().nullable().optional(),
  endLng: z.number().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  endedAt: z.string().nullable().optional(),
  needsReview: z.boolean().nullable().optional(),
})

export type TripInput = z.infer<typeof TripInputSchema>

// Returns Prisma data for the trip, or an error message for the user.
export function tripData(input: TripInput): { data: any } | { error: string } {
  const needsReview = input.needsReview === true
  // An auto-detected drive has no purpose yet; everything else needs one for the IRS log.
  if (!needsReview && !input.purpose.trim()) return { error: "Pick a business purpose for this trip" }
  if (!needsReview && !input.destination.trim()) return { error: "Add a destination for this trip" }

  const hasOdo = input.odoStart != null && input.odoEnd != null
  let miles: number
  if (hasOdo) {
    if (input.odoEnd! <= input.odoStart!) return { error: "Odometer end must be greater than start" }
    miles = input.odoEnd! - input.odoStart!
  } else if (input.miles != null) {
    miles = input.miles
  } else {
    return { error: "Enter the miles driven or odometer readings" }
  }
  miles = Math.round(miles * 10) / 10
  if (miles <= 0) return { error: "Miles must be more than 0" }

  const date = new Date(input.date)
  if (isNaN(date.getTime())) return { error: "Invalid date" }
  const toDate = (s?: string | null) => (s ? new Date(s) : null)

  return {
    data: {
      purpose: input.purpose.trim(),
      destination: input.destination.trim(),
      odoStart: hasOdo ? input.odoStart : null,
      odoEnd: hasOdo ? input.odoEnd : null,
      miles,
      date,
      deductible: calcMileageDeductible(miles, date),
      source: input.source ?? (hasOdo ? "odometer" : "manual"),
      startPlace: input.startPlace?.trim() || null,
      startLat: input.startLat ?? null,
      startLng: input.startLng ?? null,
      endLat: input.endLat ?? null,
      endLng: input.endLng ?? null,
      startedAt: toDate(input.startedAt),
      endedAt: toDate(input.endedAt),
      needsReview,
    },
  }
}
