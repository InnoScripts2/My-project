import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { dtcService, type DtcLookupMatch } from '../../dtc/service.js';

const lookupSchema = z.object({
  codes: z.array(z.string().min(1)).min(1).max(50),
  brand: z.string().optional(),
  includeAlternatives: z.boolean().optional(),
  limitPerCode: z.number().int().positive().max(5).optional(),
});

function serializeMatch(match: DtcLookupMatch) {
  return {
    code: match.code,
    brand: match.brand,
    descriptionRu: match.descriptionRu,
    descriptionEn: match.descriptionEn,
    severity: match.severity,
    packageId: match.packageId,
    version: match.version,
    installedAtUtc: match.installedAtUtc,
  };
}

export function createDtcRoutes(): Router {
  const router = Router();

  router.get('/api/dtc/packages', (_req: Request, res: Response) => {
    try {
      const packages = dtcService.listActivePackages();
      res.json({ packages });
    } catch (error: any) {
      res.status(500).json({
        error: 'dtc_packages_unavailable',
        message: error?.message || 'Failed to read DTC packages',
      });
    }
  });

  router.post('/api/dtc/lookup', (req: Request, res: Response) => {
    const parsed = lookupSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'invalid_payload',
        issues: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const includeAlternatives = parsed.data.includeAlternatives ?? false;
      const limitPerCode = parsed.data.limitPerCode ?? (includeAlternatives ? undefined : 1);
      const lookup = dtcService.lookup(parsed.data.codes, {
        brand: parsed.data.brand,
        limitPerCode,
      });

      const matches = lookup.entries.map((entry) => {
        const [primary, ...rest] = entry.matches;
        const payload: Record<string, unknown> = {
          code: entry.code,
          found: Boolean(primary),
          match: primary ? serializeMatch(primary) : null,
        };
        if (includeAlternatives) {
          payload.alternatives = rest.map(serializeMatch);
        }
        return payload;
      });

      const missing = matches
        .filter((item) => item.found !== true)
        .map((item) => item.code as string);

      res.json({
        brand: parsed.data.brand?.trim() || null,
        matches,
        missingCodes: missing,
        invalidCodes: lookup.invalidCodes,
      });
    } catch (error: any) {
      res.status(500).json({
        error: 'dtc_lookup_failed',
        message: error?.message || 'Failed to resolve DTC descriptions',
      });
    }
  });

  return router;
}
