import { z } from "zod";

export const RowsParams = z.object({
  table: z.string().min(1),
  limit: z.coerce.number().int().optional(),
  offset: z.coerce.number().int().optional(),
  sort: z.string().optional(),
  dir: z.enum(["asc", "desc"]).optional(),
  q: z.string().optional(),
  eqCol: z.string().optional(),
  eqVal: z.string().optional(),
});

export const SqlBody = z.object({ sql: z.string(), max: z.number().int().optional() });
