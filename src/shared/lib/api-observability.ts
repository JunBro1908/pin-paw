import "server-only";

import type { ApiRouteClass } from "@/shared/lib/structured-log";
import { observeApiRequest } from "@/shared/lib/structured-log";
import { recordApiObservation } from "@/shared/lib/operational-metrics";
import { createServiceRoleSupabase } from "@/shared/supabase/server";

export function observeServiceApiRequest(
  request: Request,
  context: { routeClass: ApiRouteClass; route: string },
  handler: () => Promise<Response>
): Promise<Response> {
  return observeApiRequest(request, context, handler, {
    record: async (observation) => {
      const recorded = await recordApiObservation(
        createServiceRoleSupabase(),
        observation
      );
      if (!recorded) throw new Error("api_observation_not_recorded");
    },
  });
}
