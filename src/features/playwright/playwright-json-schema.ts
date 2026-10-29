import { z } from "zod";

const nonNegativeNumber = z.number().finite().nonnegative();
const nonNegativeInteger = z.number().int().nonnegative();

const annotationSchema = z
  .object({
    type: z.string(),
    description: z.string().optional(),
  })
  .passthrough();

const attachmentSchema = z
  .object({
    name: z.string(),
    contentType: z.string().optional(),
    path: z.string().optional(),
    body: z.unknown().optional(),
  })
  .passthrough();

const resultSchema = z
  .object({
    status: z.string(),
    retry: nonNegativeInteger.optional(),
    duration: nonNegativeNumber.optional(),
    error: z.unknown().optional(),
    errors: z.array(z.unknown()).optional(),
    annotations: z.array(annotationSchema).optional(),
    attachments: z.array(attachmentSchema).optional(),
  })
  .passthrough();

const testCaseSchema = z
  .object({
    projectName: z.string().optional(),
    expectedStatus: z.string().optional(),
    annotations: z.array(annotationSchema).optional(),
    results: z.array(resultSchema).optional(),
  })
  .passthrough();

const specSchema = z
  .object({
    title: z.string(),
    file: z.string().optional(),
    line: nonNegativeInteger.optional(),
    column: nonNegativeInteger.optional(),
    tests: z.array(testCaseSchema).optional(),
  })
  .passthrough();

export interface PlaywrightSuite {
  title: string;
  file?: string;
  line?: number;
  column?: number;
  specs?: Array<z.infer<typeof specSchema>>;
  suites?: PlaywrightSuite[];
}

const suiteSchema: z.ZodType<PlaywrightSuite> = z.lazy(() =>
  z
    .object({
      title: z.string(),
      file: z.string().optional(),
      line: nonNegativeInteger.optional(),
      column: nonNegativeInteger.optional(),
      specs: z.array(specSchema).optional(),
      suites: z.array(suiteSchema).optional(),
    })
    .passthrough(),
);

const statsSchema = z
  .object({
    startTime: z.string().optional(),
    duration: nonNegativeNumber.optional(),
    expected: nonNegativeInteger.optional(),
    skipped: nonNegativeInteger.optional(),
    unexpected: nonNegativeInteger.optional(),
    flaky: nonNegativeInteger.optional(),
  })
  .passthrough();

export const playwrightJsonReportSchema = z
  .object({
    config: z.record(z.string(), z.unknown()),
    suites: z.array(suiteSchema),
    errors: z.array(z.unknown()).optional(),
    stats: statsSchema,
  })
  .passthrough();

export type PlaywrightJsonReport = z.infer<typeof playwrightJsonReportSchema>;
